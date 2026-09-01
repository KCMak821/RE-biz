import { createHash, randomBytes } from "node:crypto";

import { compare, hash } from "bcryptjs";
import { Binary, ObjectId } from "mongodb";
import { cookies } from "next/headers";

import { getDatabase } from "@/lib/mongodb";
import { defaultReceiptTemplate, normalizeUploadedSealLayout, type ReceiptTemplate } from "@/lib/receipt-template";
import { defaultWorkspaceFeatures, readWorkspaceFeatures, type WorkspaceFeatures } from "@/lib/workspace-features";

const SESSION_COOKIE = "receipt_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

export const memberRoles = ["owner", "admin", "operator", "viewer"] as const;
export type MemberRole = typeof memberRoles[number];
export const platformRoles = ["USER", "SUPER_ADMIN"] as const;
export type PlatformRole = typeof platformRoles[number];
export const accountStatuses = ["active", "disabled"] as const;
export type AccountStatus = typeof accountStatuses[number];
export const workspaceStatuses = ["active", "suspended"] as const;
export type WorkspaceStatus = typeof workspaceStatuses[number];

export type AppUser = {
  email: string;
  /**
   * Which workspace features a platform admin currently allows. Carried on the
   * session so navigation can hide what is switched off instead of letting the
   * user discover it from a 403.
   */
  features: WorkspaceFeatures;
  id: string;
  mustChangePassword: boolean;
  name: string;
  platformRole: PlatformRole;
  organization: {
    address: string;
    bankDetails: string;
    businessRegistration: string;
    contact: string;
    currency: string;
    email: string;
    hasLogo: boolean;
    hasSealImage: boolean;
    id: string;
    name: string;
    phone: string;
    receiptTemplate: ReceiptTemplate;
    role: MemberRole;
    sealUpdatedAt?: string;
    status: WorkspaceStatus;
    timeZone: string;
  };
};
export type PlatformAdminActor = { email: string; id: string; name: string; platformRole: "SUPER_ADMIN" };

export type UserDocument = {
  accountStatus?: AccountStatus;
  createdAt: Date;
  email: string;
  mustChangePassword?: boolean;
  name: string;
  passwordHash: string;
  platformRole?: PlatformRole;
};

type OrganizationLogo = { contentType: "image/jpeg" | "image/png" | "image/svg+xml"; data: Binary | Buffer };
export type OrganizationSeal = { contentType: "image/jpeg" | "image/png" | "image/webp"; data: Binary | Buffer; updatedAt: Date };
export type OrganizationDocument = {
  address?: string;
  bankDetails?: string;
  businessRegistration?: string;
  contact?: string;
  createdAt: Date;
  createdBy: ObjectId;
  currency: string;
  email?: string;
  logo?: OrganizationLogo;
  name: string;
  phone?: string;
  receiptTemplate?: ReceiptTemplate;
  seal?: OrganizationSeal;
  status?: WorkspaceStatus;
  timeZone: string;
};
type MembershipStatus = "active" | "suspended";
type MembershipDocument = {
  createdAt: Date;
  createdBy: ObjectId;
  organizationId: ObjectId;
  role: MemberRole;
  status: MembershipStatus;
  userId: ObjectId;
};
type SessionDocument = { expiresAt: Date; tokenHash: string; userId: ObjectId };

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function userCollections(database: Awaited<ReturnType<typeof getDatabase>>) {
  return {
    memberships: database.collection<MembershipDocument>("memberships"),
    organizations: database.collection<OrganizationDocument>("organizations"),
    users: database.collection<UserDocument>("users"),
  };
}

export async function prepareAuthCollections() {
  const database = await getDatabase();
  await Promise.all([
    database.collection<UserDocument>("users").createIndex({ email: 1 }, { unique: true }),
    database.collection<UserDocument>("users").createIndex({ accountStatus: 1, platformRole: 1 }),
    database.collection<MembershipDocument>("memberships").createIndex({ organizationId: 1, userId: 1 }, { unique: true }),
    database.collection<MembershipDocument>("memberships").createIndex({ userId: 1, status: 1 }),
    database.collection<OrganizationDocument>("organizations").createIndex({ status: 1, createdAt: -1 }),
    database.collection<SessionDocument>("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.collection<SessionDocument>("sessions").createIndex({ tokenHash: 1 }, { unique: true }),
  ]);
}

async function createUser(input: { email: string; mustChangePassword: boolean; name: string; password: string }) {
  const database = await getDatabase();
  const { users } = userCollections(database);
  const email = input.email.toLowerCase();
  try {
    const result = await users.insertOne({
      accountStatus: "active", createdAt: new Date(), email, mustChangePassword: input.mustChangePassword, name: input.name,
      passwordHash: await hash(input.password, 12),
      platformRole: "USER",
    });
    return { email, id: result.insertedId.toHexString(), name: input.name };
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000) throw new Error("EMAIL_TAKEN");
    throw error;
  }
}

async function ensureOrganization(user: { _id: ObjectId; name: string }) {
  const database = await getDatabase();
  const { memberships, organizations } = userCollections(database);
  const membership = await memberships.findOne({ status: "active", userId: user._id })
    ?? await memberships.findOne({ userId: user._id });
  if (membership) return membership;

  const organization = await organizations.insertOne({ createdAt: new Date(), createdBy: user._id, currency: "HKD", name: `${user.name} 的公司`, status: "active", timeZone: "Asia/Hong_Kong" });
  const created = { createdAt: new Date(), createdBy: user._id, organizationId: organization.insertedId, role: "owner" as const, status: "active" as const, userId: user._id };
  await memberships.insertOne(created);
  return created;
}

async function toAppUser(user: UserDocument & { _id: ObjectId }): Promise<AppUser | null> {
  if (user.accountStatus === "disabled") return null;
  const membership = await ensureOrganization(user);
  if (membership.status !== "active") return null;
  const organization = await (await getDatabase()).collection<OrganizationDocument>("organizations").findOne({ _id: membership.organizationId });
  if (!organization) return null;
  // A suspended workspace can use nothing, so the session reports every feature
  // as unavailable rather than relying on each page to re-check the status.
  const features = organization.status === "suspended"
    ? { accounting: false, invoices: false, quotations: false, receipts: false }
    : await readWorkspaceFeatures(membership.organizationId).catch(() => defaultWorkspaceFeatures());
  return {
    email: user.email, features, id: user._id.toHexString(), mustChangePassword: user.mustChangePassword === true, name: user.name,
    platformRole: user.platformRole ?? "USER",
    organization: {
      address: organization.address ?? "", bankDetails: organization.bankDetails ?? "", businessRegistration: organization.businessRegistration ?? "", contact: organization.contact ?? "", currency: organization.currency ?? "HKD", email: organization.email ?? "",
      hasLogo: Boolean(organization.logo), hasSealImage: Boolean(organization.seal), id: organization._id.toHexString(), name: organization.name, phone: organization.phone ?? "", receiptTemplate: normalizeUploadedSealLayout({ ...defaultReceiptTemplate, ...organization.receiptTemplate }), role: membership.role, sealUpdatedAt: organization.seal?.updatedAt.toISOString(), timeZone: organization.timeZone ?? "Asia/Hong_Kong",
      status: organization.status ?? "active",
    },
  };
}

export async function createInitialOwner(input: { email: string; name: string; password: string }) {
  await prepareAuthCollections();
  const database = await getDatabase();
  if (await database.collection<UserDocument>("users").countDocuments({}, { limit: 1 })) throw new Error("SETUP_COMPLETE");
  const created = await createUser({ ...input, mustChangePassword: false });
  const user = await database.collection<UserDocument>("users").findOne({ _id: new ObjectId(created.id) });
  if (!user) throw new Error("USER_NOT_FOUND");
  return toAppUser(user);
}

export async function registerOrganizationOwner(input: {
  address?: string;
  businessRegistration?: string;
  companyName: string;
  contact?: string;
  currency: string;
  email: string;
  logo?: OrganizationLogo;
  name: string;
  password: string;
  timeZone: string;
}) {
  await prepareAuthCollections();
  const created = await createUser({ email: input.email, mustChangePassword: false, name: input.name, password: input.password });
  const database = await getDatabase();
  const userId = new ObjectId(created.id);
  const organization = await database.collection<OrganizationDocument>("organizations").insertOne({
    address: input.address, businessRegistration: input.businessRegistration, contact: input.contact, createdAt: new Date(), createdBy: userId,
    currency: input.currency, logo: input.logo, name: input.companyName, status: "active", timeZone: input.timeZone,
  });
  await database.collection<MembershipDocument>("memberships").insertOne({
    createdAt: new Date(), createdBy: userId, organizationId: organization.insertedId, role: "owner", status: "active", userId,
  });
  const user = await database.collection<UserDocument>("users").findOne({ _id: userId });
  if (!user) throw new Error("USER_NOT_FOUND");
  return toAppUser(user);
}

export async function createMember(input: { email: string; name: string; password: string; role: Exclude<MemberRole, "owner"> }, createdBy: AppUser) {
  await prepareAuthCollections();
  const created = await createUser({ ...input, mustChangePassword: true });
  const database = await getDatabase();
  await database.collection<MembershipDocument>("memberships").insertOne({
    createdAt: new Date(), createdBy: new ObjectId(createdBy.id), organizationId: new ObjectId(createdBy.organization.id), role: input.role, status: "active", userId: new ObjectId(created.id),
  });
  return { ...created, mustChangePassword: true, role: input.role, status: "active" as const };
}

export async function listMembers(user: AppUser) {
  const database = await getDatabase();
  const { memberships, users } = userCollections(database);
  const membershipsForOrganization = await memberships.find({ organizationId: new ObjectId(user.organization.id) }).sort({ createdAt: 1 }).toArray();
  const memberUsers = await users.find({ _id: { $in: membershipsForOrganization.map((member) => member.userId) } }).toArray();
  const byId = new Map(memberUsers.map((member) => [member._id.toHexString(), member]));
  return membershipsForOrganization.flatMap((membership) => {
    const member = byId.get(membership.userId.toHexString());
    return member ? [{ email: member.email, id: member._id.toHexString(), mustChangePassword: member.mustChangePassword === true, name: member.name, role: membership.role, status: membership.status }] : [];
  });
}

export function canManageMembers(user: AppUser) { return canUseWorkspace(user) && (user.organization.role === "owner" || user.organization.role === "admin"); }
export function canUseWorkspace(user: AppUser) { return user.organization.status === "active"; }
export function isSuperAdmin(user: AppUser | null | undefined): user is AppUser { return user?.platformRole === "SUPER_ADMIN"; }
export function canManageOrganizationSettings(user: AppUser) { return canUseWorkspace(user) && (user.organization.role === "owner" || user.organization.role === "admin"); }
export function canCreateRole(user: AppUser, role: MemberRole) { return user.organization.role === "owner" ? role !== "owner" : role === "operator" || role === "viewer"; }
export function canManageRecords(user: AppUser) { return canUseWorkspace(user) && user.organization.role !== "viewer"; }

export async function updateMemberStatus(manager: AppUser, memberId: string, status: MembershipStatus) {
  if (!canManageMembers(manager) || memberId === manager.id) throw new Error("MEMBER_FORBIDDEN");
  const memberships = (await getDatabase()).collection<MembershipDocument>("memberships");
  const membership = await memberships.findOne({ organizationId: new ObjectId(manager.organization.id), userId: new ObjectId(memberId) });
  if (!membership || membership.role === "owner" || (manager.organization.role === "admin" && membership.role === "admin")) throw new Error("MEMBER_FORBIDDEN");
  await memberships.updateOne({ _id: membership._id }, { $set: { status } });
}

export async function authenticateUser(email: string, password: string): Promise<AppUser | null> {
  await prepareAuthCollections();
  const user = await (await getDatabase()).collection<UserDocument>("users").findOne({ email: email.toLowerCase() });
  if (!user || !(await compare(password, user.passwordHash))) return null;
  return toAppUser(user);
}

export async function changePassword(user: AppUser, currentPassword: string, nextPassword: string) {
  const users = (await getDatabase()).collection<UserDocument>("users");
  const document = await users.findOne({ _id: new ObjectId(user.id) });
  if (!document || !(await compare(currentPassword, document.passwordHash))) throw new Error("INVALID_PASSWORD");
  await users.updateOne({ _id: document._id }, { $set: { mustChangePassword: false, passwordHash: await hash(nextPassword, 12) } });
}

export async function getOrganizationLogo(user: AppUser) {
  return (await getDatabase()).collection<OrganizationDocument>("organizations").findOne(
    { _id: new ObjectId(user.organization.id) }, { projection: { logo: 1 } },
  ).then((organization) => organization?.logo ?? null);
}

export async function getOrganizationSeal(user: AppUser) {
  return (await getDatabase()).collection<OrganizationDocument>("organizations").findOne(
    { _id: new ObjectId(user.organization.id) }, { projection: { seal: 1 } },
  ).then((organization) => organization?.seal ?? null);
}

export async function updateOrganizationSeal(user: AppUser, seal: OrganizationSeal) {
  await (await getDatabase()).collection<OrganizationDocument>("organizations").updateOne(
    { _id: new ObjectId(user.organization.id) },
    { $set: { seal } },
  );
}

export async function updateOrganizationReceiptTemplate(user: AppUser, receiptTemplate: ReceiptTemplate) {
  const database = await getDatabase();
  // Receipts created before layout snapshots existed must be frozen before the
  // organization default changes, otherwise this save would restyle history.
  await database.collection("receipts").updateMany(
    { organizationId: new ObjectId(user.organization.id), receiptTemplateSnapshot: { $exists: false } },
    { $set: { receiptTemplateSnapshot: { ...user.organization.receiptTemplate } } },
  );
  await database.collection<OrganizationDocument>("organizations").updateOne(
    { _id: new ObjectId(user.organization.id) },
    { $set: { receiptTemplate } },
  );
}

export async function updateOrganizationProfile(user: AppUser, profile: {
  address: string;
  bankDetails: string;
  businessRegistration: string;
  contact: string;
  email: string;
  name: string;
  phone: string;
}) {
  await (await getDatabase()).collection<OrganizationDocument>("organizations").updateOne(
    { _id: new ObjectId(user.organization.id) },
    { $set: profile },
  );
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await (await getDatabase()).collection<SessionDocument>("sessions").insertOne({ expiresAt, tokenHash: tokenHash(token), userId: new ObjectId(userId) });
  return { expiresAt, token };
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const user = await getCurrentSessionUser();
  return user ? toAppUser(user) : null;
}

async function getCurrentSessionUser(): Promise<(UserDocument & { _id: ObjectId }) | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const database = await getDatabase();
  const session = await database.collection<SessionDocument>("sessions").findOne({ expiresAt: { $gt: new Date() }, tokenHash: tokenHash(token) });
  if (!session) return null;
  return database.collection<UserDocument>("users").findOne({ _id: session.userId });
}

export async function getCurrentPlatformAdmin(): Promise<PlatformAdminActor | null> {
  const user = await getCurrentSessionUser();
  if (!user || user.accountStatus === "disabled" || user.platformRole !== "SUPER_ADMIN") return null;
  return { email: user.email, id: user._id.toHexString(), name: user.name, platformRole: "SUPER_ADMIN" };
}

export async function deleteCurrentSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await (await getDatabase()).collection<SessionDocument>("sessions").deleteOne({ tokenHash: tokenHash(token) });
}

export function sessionCookie(token: string, expiresAt: Date) {
  return { name: SESSION_COOKIE, expires: expiresAt, httpOnly: true, maxAge: Math.floor(SESSION_DURATION_MS / 1000), path: "/", sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", value: token };
}

export const sessionCookieName = SESSION_COOKIE;
