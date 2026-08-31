import { ObjectId } from "mongodb";

import { getCurrentPlatformAdmin, type AccountStatus, type OrganizationDocument, type PlatformAdminActor, type PlatformRole, type UserDocument, type WorkspaceStatus } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";

export const workspaceFeatureKeys = ["receipts", "accounting", "quotations"] as const;
export type WorkspaceFeatureKey = typeof workspaceFeatureKeys[number];
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
  usage: WorkspaceUsage;
};
export type AdminUserRow = {
  accountStatus: AccountStatus;
  createdAt: string;
  email: string;
  id: string;
  name: string;
  platformRole: PlatformRole;
  workspace: { id: string; name: string } | null;
  workspaceRole: MembershipDocument["role"] | null;
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
  const [totalWorkspaces, activeWorkspaces, totalUsers, totalReceipts, totalAccountingRecords, totalQuotations] = await Promise.all([
    organizations.countDocuments(),
    organizations.countDocuments({ status: { $ne: "suspended" } }),
    database.collection<UserDocument>("users").countDocuments(),
    database.collection("receipts").countDocuments(),
    database.collection("ledgerEntries").countDocuments(),
    database.collection("quotes").countDocuments(),
  ]);
  return { activeWorkspaces, totalAccountingRecords, totalQuotations, totalReceipts, totalUsers, totalWorkspaces };
}

export async function getWorkspaceUsage(organizationId: ObjectId): Promise<WorkspaceUsage> {
  const database = await getDatabase();
  const [receipts, accountingRecords, quotations] = await Promise.all([
    database.collection("receipts").countDocuments({ organizationId }),
    database.collection("ledgerEntries").countDocuments({ organizationId }),
    database.collection("quotes").countDocuments({ organizationId }),
  ]);
  return { accountingRecords, quotations, receipts };
}

async function workspaceFeatureRows(organizationId: ObjectId) {
  const rows = await (await getDatabase()).collection<WorkspaceFeatureDocument>("workspaceFeatures").find({ organizationId }).toArray();
  const enabledByKey = new Map(rows.map((row) => [row.featureKey, row.enabled]));
  return workspaceFeatureKeys.map((featureKey) => ({ enabled: enabledByKey.get(featureKey) ?? true, featureKey }));
}

export async function isWorkspaceFeatureEnabled(organizationId: ObjectId, featureKey: WorkspaceFeatureKey) {
  const feature = await (await getDatabase()).collection<WorkspaceFeatureDocument>("workspaceFeatures").findOne({ organizationId, featureKey });
  return feature?.enabled ?? true;
}

export async function canUseWorkspaceFeature(user: { organization: { id: string; status: WorkspaceStatus } }, featureKey: WorkspaceFeatureKey) {
  if (user.organization.status === "suspended") return false;
  return isWorkspaceFeatureEnabled(new ObjectId(user.organization.id), featureKey);
}

export async function listAdminWorkspaces(): Promise<AdminWorkspace[]> {
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
  return organizations.map((organization) => {
    const organizationMemberships = memberships.filter((membership) => membership.organizationId.equals(organization._id));
    const ownerMembership = organizationMemberships.find((membership) => membership.role === "owner");
    const owner = ownerMembership ? usersById.get(ownerMembership.userId.toHexString()) : undefined;
    return {
      createdAt: organization.createdAt.toISOString(),
      id: organization._id.toHexString(),
      name: organization.name,
      owner: owner ? { email: owner.email, name: owner.name } : null,
      status: workspaceStatus(organization.status),
      userCount: organizationMemberships.filter((membership) => membership.status === "active").length,
    };
  });
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
  return users.flatMap<AdminUserRow>((user) => {
    const userMemberships = memberships.filter((membership) => membership.userId.equals(user._id));
    const base = {
      accountStatus: accountStatus(user.accountStatus), createdAt: user.createdAt.toISOString(), email: user.email,
      id: user._id.toHexString(), name: user.name, platformRole: user.platformRole ?? "USER",
    };
    if (!userMemberships.length) return [{ ...base, workspace: null, workspaceRole: null }];
    return userMemberships.map((membership) => {
      const organization = organizationsById.get(membership.organizationId.toHexString());
      return {
        ...base,
        workspace: organization ? { id: organization._id.toHexString(), name: organization.name } : null,
        workspaceRole: membership.role,
      };
    });
  });
}

async function writePlatformAuditLog(input: Omit<PlatformAuditLogDocument, "createdAt">) {
  await (await getDatabase()).collection<PlatformAuditLogDocument>("platformAuditLogs").insertOne({ ...input, createdAt: new Date() });
}

async function writePlatformAuditLogBestEffort(input: Omit<PlatformAuditLogDocument, "createdAt">) {
  try {
    await writePlatformAuditLog(input);
  } catch (error) {
    // The local MongoDB deployment is a standalone server, so transactions
    // cannot be assumed. The business mutation is the source of truth: never
    // report it as failed solely because its audit write failed. Driver error
    // messages can contain request context, so log only a stable error type.
    const errorType = error instanceof Error ? error.name : typeof error;
    console.error(`Platform audit log write failed after a successful mutation: action=${input.action} targetType=${input.targetType} targetId=${input.targetId} errorType=${errorType}`);
  }
}

export async function updateWorkspaceStatus(actor: Pick<PlatformAdminActor, "id">, workspaceId: string, status: WorkspaceStatus) {
  if (!ObjectId.isValid(workspaceId)) return false;
  await preparePlatformAdminCollections();
  const result = await (await getDatabase()).collection<OrganizationDocument>("organizations").updateOne(
    { _id: new ObjectId(workspaceId) }, { $set: { status } },
  );
  if (!result.matchedCount) return false;
  await writePlatformAuditLogBestEffort({
    action: status === "suspended" ? "WORKSPACE_SUSPENDED" : "WORKSPACE_REACTIVATED",
    actorUserId: new ObjectId(actor.id), targetId: workspaceId, targetType: "workspace",
  });
  return true;
}

export async function updateWorkspaceFeature(actor: Pick<PlatformAdminActor, "id">, workspaceId: string, featureKey: WorkspaceFeatureKey, enabled: boolean) {
  if (!ObjectId.isValid(workspaceId)) return false;
  await preparePlatformAdminCollections();
  const organizationId = new ObjectId(workspaceId);
  const database = await getDatabase();
  if (!await database.collection<OrganizationDocument>("organizations").findOne({ _id: organizationId }, { projection: { _id: 1 } })) return false;
  await database.collection<WorkspaceFeatureDocument>("workspaceFeatures").updateOne(
    { organizationId, featureKey },
    { $set: { enabled, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
  await writePlatformAuditLogBestEffort({
    action: enabled ? "FEATURE_ENABLED" : "FEATURE_DISABLED", actorUserId: new ObjectId(actor.id),
    metadata: { enabled, featureKey }, targetId: `${workspaceId}:${featureKey}`, targetType: "workspace_feature",
  });
  return true;
}

export async function updatePlatformUserStatus(actor: Pick<PlatformAdminActor, "id">, userId: string, status: AccountStatus) {
  if (!ObjectId.isValid(userId) || userId === actor.id) return false;
  await preparePlatformAdminCollections();
  const result = await (await getDatabase()).collection<UserDocument>("users").updateOne(
    { _id: new ObjectId(userId) }, { $set: { accountStatus: status } },
  );
  if (!result.matchedCount) return false;
  await writePlatformAuditLogBestEffort({
    action: status === "disabled" ? "USER_DISABLED" : "USER_ENABLED",
    actorUserId: new ObjectId(actor.id), targetId: userId, targetType: "user",
  });
  return true;
}

export async function listPlatformAuditLogs() {
  await preparePlatformAdminCollections();
  const database = await getDatabase();
  const entries = await database.collection<PlatformAuditLogDocument>("platformAuditLogs").find({}).sort({ createdAt: -1 }).limit(200).toArray();
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
