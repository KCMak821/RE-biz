import { ObjectId, type ClientSession, type Filter } from "mongodb";

import { getCurrentPlatformAdmin, type AccountStatus, type OrganizationDocument, type PlatformAdminActor, type PlatformRole, type UserDocument, type WorkspaceStatus } from "@/lib/auth";
import { getDatabase, getMongoClient } from "@/lib/mongodb";
import { escapedRegex, keywordRegex } from "@/lib/query";

// Feature keys and the raw switch reader live in lib/workspace-features so that
// lib/auth can put them on the session without importing this module.
export { isWorkspaceFeatureEnabled, workspaceFeatureKeys, type WorkspaceFeatureKey } from "@/lib/workspace-features";
import { isWorkspaceFeatureEnabled, workspaceFeatureKeys, type WorkspaceFeatureKey } from "@/lib/workspace-features";
export const platformAuditActions = [
  "WORKSPACE_SUSPENDED",
  "WORKSPACE_REACTIVATED",
  "USER_DISABLED",
  "USER_ENABLED",
  "FEATURE_ENABLED",
  "FEATURE_DISABLED",
] as const;
export type PlatformAuditAction = typeof platformAuditActions[number];

type MembershipDocument = {
  createdAt: Date;
  organizationId: ObjectId;
  role: "owner" | "admin" | "operator" | "viewer";
  status: "active" | "suspended";
  userId: ObjectId;
};
type WorkspaceFeatureDocument = {
  createdAt: Date;
  enabled: boolean;
  featureKey: WorkspaceFeatureKey;
  organizationId: ObjectId;
  updatedAt: Date;
};
type PlatformAuditLogDocument = {
  action: PlatformAuditAction;
  actorUserId: ObjectId;
  createdAt: Date;
  metadata?: Record<string, boolean | number | string>;
  targetId: string;
  targetType: "user" | "workspace" | "workspace_feature";
};

export type WorkspaceUsage = {
  accountingRecords: number;
  quotations: number;
  receipts: number;
};
export type AdminWorkspace = {
  createdAt: string;
  id: string;
  name: string;
  owner: { email: string; name: string } | null;
  status: WorkspaceStatus;
  usage: WorkspaceUsage;
  userCount: number;
};
export type AdminWorkspaceDetail = AdminWorkspace & {
  features: Array<{ enabled: boolean; featureKey: WorkspaceFeatureKey }>;
  members: Array<{
    accountStatus: AccountStatus;
    email: string;
    id: string;
    name: string;
    role: MembershipDocument["role"];
    status: MembershipDocument["status"];
  }>;
};
/**
 * One row per person, not per membership. The platform view answers "who is
 * this and how much of the platform do they touch", so a user who belongs to
 * three companies is one row showing three, rather than three near-identical
 * rows that make the list look longer than the user base.
 */
export type AdminUserRow = {
  accountStatus: AccountStatus;
  createdAt: string;
  email: string;
  id: string;
  name: string;
  platformRole: PlatformRole;
  workspaceCount: number;
  workspaces: Array<{ id: string; name: string; role: MembershipDocument["role"] }>;
};
export type PlatformAuditLogFilters = {
  /** Inclusive `YYYY-MM-DD` lower bound, read in the server's local time. */
  from?: string;
  limit?: number;
  /** Inclusive `YYYY-MM-DD` upper bound: the whole of that day is included. */
  to?: string;
  workspaceId?: string;
};

function workspaceStatus(value: OrganizationDocument["status"]) { return value ?? "active"; }
function accountStatus(value: UserDocument["accountStatus"]) { return value ?? "active"; }

export async function preparePlatformAdminCollections() {
  const database = await getDatabase();
  await Promise.all([
    database.collection<WorkspaceFeatureDocument>("workspaceFeatures").createIndex({ organizationId: 1, featureKey: 1 }, { unique: true }),
    database.collection<PlatformAuditLogDocument>("platformAuditLogs").createIndex({ createdAt: -1 }),
    database.collection<PlatformAuditLogDocument>("platformAuditLogs").createIndex({ actorUserId: 1, createdAt: -1 }),
    database.collection<PlatformAuditLogDocument>("platformAuditLogs").createIndex({ targetType: 1, targetId: 1, createdAt: -1 }),
  ]);
}

export async function getCurrentSuperAdmin(): Promise<PlatformAdminActor | null> { return getCurrentPlatformAdmin(); }

export async function getPlatformOverview() {
  await preparePlatformAdminCollections();
  const database = await getDatabase();
  const organizations = database.collection<OrganizationDocument>("organizations");
  const [totalWorkspaces, suspendedWorkspaces, totalUsers, totalReceipts, totalAccountingRecords, totalQuotations, recentAuditLogs] = await Promise.all([
    organizations.countDocuments(),
    organizations.countDocuments({ status: "suspended" }),
    database.collection<UserDocument>("users").countDocuments(),
    database.collection("receipts").countDocuments(),
    database.collection("ledgerEntries").countDocuments(),
    database.collection("quotes").countDocuments(),
    listPlatformAuditLogs({ limit: 6 }),
  ]);
  return {
    // Workspaces predating the status field count as active, so the active
    // total is the remainder rather than a second status query.
    activeWorkspaces: totalWorkspaces - suspendedWorkspaces,
    recentAuditLogs, suspendedWorkspaces, totalAccountingRecords, totalQuotations, totalReceipts, totalUsers, totalWorkspaces,
  };
}

function emptyUsage(): WorkspaceUsage { return { accountingRecords: 0, quotations: 0, receipts: 0 }; }

/**
 * Usage for many workspaces in three grouped queries rather than three counts
 * per workspace, so the workspace and usage lists stay flat as companies are
 * added. Every count is grouped by organizationId, which is what keeps one
 * company's totals out of another company's row.
 */
async function usageByWorkspace(organizationIds: ObjectId[]): Promise<Map<string, WorkspaceUsage>> {
  const usage = new Map(organizationIds.map((id) => [id.toHexString(), emptyUsage()]));
  if (!organizationIds.length) return usage;
  const database = await getDatabase();
  const sources = [["receipts", "receipts"], ["ledgerEntries", "accountingRecords"], ["quotes", "quotations"]] as const;
  await Promise.all(sources.map(async ([collectionName, key]) => {
    const rows = await database.collection(collectionName).aggregate<{ _id: ObjectId | null; count: number }>([
      { $match: { organizationId: { $in: organizationIds } } },
      { $group: { _id: "$organizationId", count: { $sum: 1 } } },
    ]).toArray();
    for (const row of rows) {
      const entry = row._id ? usage.get(row._id.toHexString()) : undefined;
      if (entry) entry[key] = row.count;
    }
  }));
  return usage;
}

export async function getWorkspaceUsage(organizationId: ObjectId): Promise<WorkspaceUsage> {
  return (await usageByWorkspace([organizationId])).get(organizationId.toHexString()) ?? emptyUsage();
}

async function workspaceFeatureRows(organizationId: ObjectId) {
  const rows = await (await getDatabase()).collection<WorkspaceFeatureDocument>("workspaceFeatures").find({ organizationId }).toArray();
  const enabledByKey = new Map(rows.map((row) => [row.featureKey, row.enabled]));
  return workspaceFeatureKeys.map((featureKey) => ({ enabled: enabledByKey.get(featureKey) ?? true, featureKey }));
}

export async function canUseWorkspaceFeature(user: { organization: { id: string; status: WorkspaceStatus } }, featureKey: WorkspaceFeatureKey) {
  if (user.organization.status === "suspended") return false;
  return isWorkspaceFeatureEnabled(new ObjectId(user.organization.id), featureKey);
}

export async function listAdminWorkspaces({ keyword = "" }: { keyword?: string } = {}): Promise<AdminWorkspace[]> {
  await preparePlatformAdminCollections();
  const database = await getDatabase();
  const organizations = await database.collection<OrganizationDocument>("organizations").find({}).sort({ createdAt: -1 }).toArray();
  const organizationIds = organizations.map((organization) => organization._id);
  const memberships = organizationIds.length
    ? await database.collection<MembershipDocument>("memberships").find({ organizationId: { $in: organizationIds } }).toArray()
    : [];
  const userIds = memberships.map((membership) => membership.userId);
  const users = userIds.length ? await database.collection<UserDocument>("users").find({ _id: { $in: userIds } }, { projection: { email: 1, name: 1 } }).toArray() : [];
  const usersById = new Map(users.map((user) => [user._id.toHexString(), user]));
  const usage = await usageByWorkspace(organizationIds);
  const rows = organizations.map((organization) => {
    const organizationMemberships = memberships.filter((membership) => membership.organizationId.equals(organization._id));
    const ownerMembership = organizationMemberships.find((membership) => membership.role === "owner");
    const owner = ownerMembership ? usersById.get(ownerMembership.userId.toHexString()) : undefined;
    return {
      createdAt: organization.createdAt.toISOString(),
      id: organization._id.toHexString(),
      name: organization.name,
      owner: owner ? { email: owner.email, name: owner.name } : null,
      status: workspaceStatus(organization.status),
      usage: usage.get(organization._id.toHexString()) ?? emptyUsage(),
      userCount: organizationMemberships.filter((membership) => membership.status === "active").length,
    };
  });
  const trimmed = keyword.trim();
  if (!trimmed) return rows;
  // Support is usually handed the company name, the owner's email, or an id
  // from a bug report, so all four match the same box.
  const matches = keywordRegex(trimmed);
  return rows.filter((row) => matches.test(row.name) || matches.test(row.id)
    || (row.owner ? matches.test(row.owner.name) || matches.test(row.owner.email) : false));
}

export async function getAdminWorkspace(id: string): Promise<AdminWorkspaceDetail | null> {
  if (!ObjectId.isValid(id)) return null;
  await preparePlatformAdminCollections();
  const organizationId = new ObjectId(id);
  const database = await getDatabase();
  const organization = await database.collection<OrganizationDocument>("organizations").findOne({ _id: organizationId });
  if (!organization) return null;
  const memberships = await database.collection<MembershipDocument>("memberships").find({ organizationId }).sort({ createdAt: 1 }).toArray();
  const users = memberships.length
    ? await database.collection<UserDocument>("users").find({ _id: { $in: memberships.map((membership) => membership.userId) } }, { projection: { accountStatus: 1, email: 1, name: 1 } }).toArray()
    : [];
  const usersById = new Map(users.map((user) => [user._id.toHexString(), user]));
  const members = memberships.flatMap((membership) => {
    const user = usersById.get(membership.userId.toHexString());
    return user ? [{
      accountStatus: accountStatus(user.accountStatus), email: user.email, id: user._id.toHexString(), name: user.name,
      role: membership.role, status: membership.status,
    }] : [];
  });
  const ownerMember = members.find((member) => member.role === "owner");
  const [usage, features] = await Promise.all([getWorkspaceUsage(organizationId), workspaceFeatureRows(organizationId)]);
  return {
    createdAt: organization.createdAt.toISOString(), features, id: organization._id.toHexString(), members, name: organization.name,
    owner: ownerMember ? { email: ownerMember.email, name: ownerMember.name } : null,
    status: workspaceStatus(organization.status), userCount: members.filter((member) => member.status === "active").length, usage,
  };
}

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  await preparePlatformAdminCollections();
  const database = await getDatabase();
  const [users, memberships, organizations] = await Promise.all([
    database.collection<UserDocument>("users").find({}, { projection: { accountStatus: 1, createdAt: 1, email: 1, name: 1, platformRole: 1 } }).sort({ createdAt: -1 }).toArray(),
    database.collection<MembershipDocument>("memberships").find({}).toArray(),
    database.collection<OrganizationDocument>("organizations").find({}, { projection: { name: 1 } }).toArray(),
  ]);
  const organizationsById = new Map(organizations.map((organization) => [organization._id.toHexString(), organization]));
  return users.map<AdminUserRow>((user) => {
    const workspaces = memberships
      .filter((membership) => membership.userId.equals(user._id))
      .flatMap((membership) => {
        const organization = organizationsById.get(membership.organizationId.toHexString());
        return organization ? [{ id: organization._id.toHexString(), name: organization.name, role: membership.role }] : [];
      });
    return {
      accountStatus: accountStatus(user.accountStatus), createdAt: user.createdAt.toISOString(), email: user.email,
      id: user._id.toHexString(), name: user.name, platformRole: user.platformRole ?? "USER",
      workspaceCount: workspaces.length, workspaces,
    };
  });
}

async function writePlatformAuditLog(input: Omit<PlatformAuditLogDocument, "createdAt">, session?: ClientSession) {
  await (await getDatabase()).collection<PlatformAuditLogDocument>("platformAuditLogs").insertOne({ ...input, createdAt: new Date() }, { session });
}

async function writePlatformAuditLogBestEffort(input: Omit<PlatformAuditLogDocument, "createdAt">) {
  try {
    await writePlatformAuditLog(input);
  } catch (error) {
    // Reached only where the deployment cannot run a transaction (see
    // auditedMutation). The business mutation is the source of truth: never
    // report it as failed solely because its audit write failed. Driver error
    // messages can contain request context, so log only a stable error type.
    const errorType = error instanceof Error ? error.name : typeof error;
    console.error(`Platform audit log write failed after a successful mutation: action=${input.action} targetType=${input.targetType} targetId=${input.targetId} errorType=${errorType}`);
  }
}

/**
 * Remembered so a standalone deployment pays for one failed transaction
 * attempt rather than one per mutation.
 */
let transactionsSupported: boolean | undefined;

/**
 * Whether the deployment simply cannot run a transaction, as opposed to the
 * transaction having failed on its merits. A standalone `mongod` rejects the
 * session's first write outright; which of these it answers with depends on the
 * server version, so all three are treated as "no transactions here".
 */
function isUnsupportedTransaction(error: unknown) {
  if (typeof error !== "object" || !error) return false;
  // 20 is IllegalOperation, raised as "Transaction numbers are only allowed on
  // a replica set member or mongos".
  if ("code" in error && error.code === 20) return true;
  const message = error instanceof Error ? error.message : "";
  return /Transaction numbers are only allowed|does not support retryable writes|[Tt]ransactions are not supported/.test(message);
}

/**
 * Applies a back-office mutation together with its audit record.
 *
 * A sensitive platform change and the log entry proving who made it belong in
 * one transaction, so neither can exist without the other. MongoDB only offers
 * multi-document transactions on a replica set or mongos, and the bundled
 * docker-compose deployment is a standalone server, so this tries the
 * transaction first and falls back to the previous best-effort write when the
 * deployment cannot run one. On that fallback path the mutation remains the
 * source of truth and a failed audit write is logged rather than surfaced.
 *
 * `mutate` must be idempotent and must report whether anything actually
 * changed: it runs a second time on the fallback path, `withTransaction` may
 * retry it, and a mutation that matched nothing must not be audited.
 */
async function auditedMutation(
  audit: Omit<PlatformAuditLogDocument, "createdAt">,
  mutate: (session?: ClientSession) => Promise<boolean>,
): Promise<boolean> {
  if (transactionsSupported !== false) {
    const session = (await getMongoClient()).startSession();
    try {
      let applied = false;
      await session.withTransaction(async () => {
        applied = await mutate(session);
        if (applied) await writePlatformAuditLog(audit, session);
      });
      transactionsSupported = true;
      return applied;
    } catch (error) {
      if (!isUnsupportedTransaction(error)) throw error;
      // The first write is what fails on a standalone server, so nothing was
      // applied and replaying the mutation below cannot double-apply it.
      transactionsSupported = false;
    } finally {
      await session.endSession().catch(() => {});
    }
  }

  const applied = await mutate();
  if (applied) await writePlatformAuditLogBestEffort(audit);
  return applied;
}

export async function updateWorkspaceStatus(actor: Pick<PlatformAdminActor, "id">, workspaceId: string, status: WorkspaceStatus) {
  if (!ObjectId.isValid(workspaceId)) return false;
  await preparePlatformAdminCollections();
  const database = await getDatabase();
  const organizationId = new ObjectId(workspaceId);
  return auditedMutation(
    {
      action: status === "suspended" ? "WORKSPACE_SUSPENDED" : "WORKSPACE_REACTIVATED",
      actorUserId: new ObjectId(actor.id), targetId: workspaceId, targetType: "workspace",
    },
    // Status is a switch, never a delete: suspending keeps every record and
    // reactivating restores access to all of it.
    async (session) => (await database.collection<OrganizationDocument>("organizations").updateOne(
      { _id: organizationId }, { $set: { status } }, { session },
    )).matchedCount > 0,
  );
}

export async function updateWorkspaceFeature(actor: Pick<PlatformAdminActor, "id">, workspaceId: string, featureKey: WorkspaceFeatureKey, enabled: boolean) {
  if (!ObjectId.isValid(workspaceId)) return false;
  await preparePlatformAdminCollections();
  const organizationId = new ObjectId(workspaceId);
  const database = await getDatabase();
  return auditedMutation(
    {
      action: enabled ? "FEATURE_ENABLED" : "FEATURE_DISABLED", actorUserId: new ObjectId(actor.id),
      metadata: { enabled, featureKey }, targetId: `${workspaceId}:${featureKey}`, targetType: "workspace_feature",
    },
    async (session) => {
      if (!await database.collection<OrganizationDocument>("organizations").findOne({ _id: organizationId }, { projection: { _id: 1 }, session })) return false;
      await database.collection<WorkspaceFeatureDocument>("workspaceFeatures").updateOne(
        { organizationId, featureKey },
        { $set: { enabled, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { session, upsert: true },
      );
      return true;
    },
  );
}

export async function updatePlatformUserStatus(actor: Pick<PlatformAdminActor, "id">, userId: string, status: AccountStatus) {
  if (!ObjectId.isValid(userId) || userId === actor.id) return false;
  await preparePlatformAdminCollections();
  const database = await getDatabase();
  return auditedMutation(
    {
      action: status === "disabled" ? "USER_DISABLED" : "USER_ENABLED",
      actorUserId: new ObjectId(actor.id), targetId: userId, targetType: "user",
    },
    async (session) => (await database.collection<UserDocument>("users").updateOne(
      { _id: new ObjectId(userId) }, { $set: { accountStatus: status } }, { session },
    )).matchedCount > 0,
  );
}

/** Reads a `YYYY-MM-DD` filter bound in the server's local time; anything else is ignored. */
function parseFilterDate(value: string | undefined, endOfDay: boolean) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = endOfDay ? new Date(year, month - 1, day, 23, 59, 59, 999) : new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function listPlatformAuditLogs(filters: PlatformAuditLogFilters = {}) {
  await preparePlatformAdminCollections();
  const database = await getDatabase();
  const query: Filter<PlatformAuditLogDocument> = {};
  const from = parseFilterDate(filters.from, false);
  const to = parseFilterDate(filters.to, true);
  if (from || to) query.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  if (filters.workspaceId && ObjectId.isValid(filters.workspaceId)) {
    // A workspace status change records the bare id; a feature switch records
    // `<workspaceId>:<featureKey>`. Both belong to the company being filtered,
    // and anchoring the pattern keeps another company's id from matching.
    query.$or = [
      { targetId: filters.workspaceId, targetType: "workspace" },
      { targetId: { $regex: `^${escapedRegex(filters.workspaceId)}:` }, targetType: "workspace_feature" },
    ];
  }
  const limit = Math.min(500, Math.max(1, Math.floor(filters.limit ?? 200)));
  const entries = await database.collection<PlatformAuditLogDocument>("platformAuditLogs").find(query).sort({ createdAt: -1 }).limit(limit).toArray();
  const actorIds = [...new Set(entries.map((entry) => entry.actorUserId.toHexString()))].map((id) => new ObjectId(id));
  const actors = actorIds.length
    ? await database.collection<UserDocument>("users").find({ _id: { $in: actorIds } }, { projection: { email: 1, name: 1 } }).toArray()
    : [];
  const actorsById = new Map(actors.map((actor) => [actor._id.toHexString(), actor]));
  return entries.map((entry) => {
    const actor = actorsById.get(entry.actorUserId.toHexString());
    return {
      action: entry.action, actor: actor ? { email: actor.email, name: actor.name } : null,
      createdAt: entry.createdAt.toISOString(), id: entry._id.toHexString(), metadata: entry.metadata ?? null,
      targetId: entry.targetId, targetType: entry.targetType,
    };
  });
}
