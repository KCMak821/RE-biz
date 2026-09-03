import { createHash, randomBytes } from "node:crypto";

import { compare, hash } from "bcryptjs";
import { ObjectId } from "mongodb";
import { cookies } from "next/headers";

import { getDatabase } from "@/lib/mongodb";

/**
 * Platform administrators, kept deliberately apart from customers.
 *
 * A platform admin used to be a row in `users` carrying `platformRole`, which
 * meant the person running RE-Biz was also one of its customers: they owned a
 * company (lib/auth's `ensureOrganization` gives every signing-in user one),
 * that company was counted in the platform's own statistics, and one session
 * cookie opened both the product and the back office.
 *
 * These admins live in their own collection, belong to no company, never appear
 * in the customer-facing data, and authenticate through their own cookie. A
 * stolen product session cannot open the back office, and a stolen admin
 * session cannot touch a customer's records.
 */

const ADMIN_SESSION_COOKIE = "rebiz_admin_session";
/** Eight hours, not the product's thirty days: a back office should not stay open for a month. */
const ADMIN_SESSION_DURATION_MS = 1000 * 60 * 60 * 8;

export const platformAdminStatuses = ["active", "disabled"] as const;
export type PlatformAdminStatus = typeof platformAdminStatuses[number];

export type PlatformAdminDocument = {
  createdAt: Date;
  email: string;
  lastLoginAt?: Date;
  name: string;
  passwordHash: string;
  status: PlatformAdminStatus;
};

type PlatformAdminSessionDocument = { adminId: ObjectId; expiresAt: Date; tokenHash: string };

/** What the back office knows about whoever is signed in. Deliberately has no company. */
export type PlatformAdminActor = { email: string; id: string; name: string };

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function collections(database: Awaited<ReturnType<typeof getDatabase>>) {
  return {
    admins: database.collection<PlatformAdminDocument>("platformAdmins"),
    sessions: database.collection<PlatformAdminSessionDocument>("platformAdminSessions"),
  };
}

export async function preparePlatformAuthCollections() {
  const database = await getDatabase();
  const { admins, sessions } = collections(database);
  await Promise.all([
    admins.createIndex({ email: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    sessions.createIndex({ tokenHash: 1 }, { unique: true }),
    sessions.createIndex({ adminId: 1 }),
  ]);
}

export async function createPlatformAdmin(input: { email: string; name: string; password: string }) {
  await preparePlatformAuthCollections();
  const database = await getDatabase();
  const email = input.email.trim().toLowerCase();
  try {
    const result = await collections(database).admins.insertOne({
      createdAt: new Date(), email, name: input.name.trim(),
      passwordHash: await hash(input.password, 12), status: "active",
    });
    return { email, id: result.insertedId.toHexString(), name: input.name.trim() };
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000) throw new Error("ADMIN_EMAIL_TAKEN");
    throw error;
  }
}

export async function authenticatePlatformAdmin(email: string, password: string): Promise<PlatformAdminActor | null> {
  await preparePlatformAuthCollections();
  const database = await getDatabase();
  const admin = await collections(database).admins.findOne({ email: email.trim().toLowerCase() });
  // Compare regardless of whether the row exists so a missing account and a
  // wrong password take the same time to answer.
  const matches = await compare(password, admin?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin");
  if (!admin || !matches || admin.status !== "active") return null;
  await collections(database).admins.updateOne({ _id: admin._id }, { $set: { lastLoginAt: new Date() } });
  return { email: admin.email, id: admin._id.toHexString(), name: admin.name };
}

export async function createPlatformAdminSession(adminId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_DURATION_MS);
  const database = await getDatabase();
  await collections(database).sessions.insertOne({ adminId: new ObjectId(adminId), expiresAt, tokenHash: tokenHash(token) });
  return { expiresAt, token };
}

export async function getCurrentPlatformAdmin(): Promise<PlatformAdminActor | null> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  const database = await getDatabase();
  const { admins, sessions } = collections(database);
  const session = await sessions.findOne({ expiresAt: { $gt: new Date() }, tokenHash: tokenHash(token) });
  if (!session) return null;
  const admin = await admins.findOne({ _id: session.adminId });
  // Disabling an admin takes effect immediately, without waiting for the
  // session to expire.
  if (!admin || admin.status !== "active") return null;
  return { email: admin.email, id: admin._id.toHexString(), name: admin.name };
}

export async function deleteCurrentPlatformAdminSession() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return;
  const database = await getDatabase();
  await collections(database).sessions.deleteOne({ tokenHash: tokenHash(token) });
}

export function platformAdminSessionCookie(token: string, expiresAt: Date) {
  return {
    name: ADMIN_SESSION_COOKIE,
    expires: expiresAt,
    httpOnly: true,
    maxAge: Math.floor(ADMIN_SESSION_DURATION_MS / 1000),
    // Scoped to the back office: the product's own pages never receive it.
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    value: token,
  };
}

export const platformAdminSessionCookieName = ADMIN_SESSION_COOKIE;
