import { createHash, randomBytes } from "node:crypto";

import { ObjectId } from "mongodb";
import { cookies } from "next/headers";

import { getDatabase } from "@/lib/mongodb";

/**
 * Platform administrators: the people who run RE-Biz, kept apart from the
 * customers who use it.
 *
 * Who may administer the platform is decided by the `PLATFORM_ADMIN_EMAILS`
 * environment variable, and identity is proven by signing in with Google. That
 * combination is deliberate: there is no admin password to create, rotate or
 * leak, and adding or removing an administrator is an edit in the hosting
 * dashboard rather than a script run against the production database. Being
 * locked out is recoverable the same way.
 *
 * The allowlist is re-read on every request, so removing an address takes
 * effect immediately even for a session that is already open.
 *
 * The `platformAdmins` collection is a record, not an authority: it exists so
 * sessions and audit-log rows have a stable id to point at. A row in it grants
 * nothing on its own.
 */

const ADMIN_SESSION_COOKIE = "rebiz_admin_session";
/** Eight hours, not the product's thirty days: a back office should not stay open for a month. */
const ADMIN_SESSION_DURATION_MS = 1000 * 60 * 60 * 8;

export type PlatformAdminDocument = {
  createdAt: Date;
  email: string;
  lastLoginAt?: Date;
  name: string;
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

/** The addresses allowed to administer the platform, lowercased. */
export function platformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedPlatformAdmin(email: string | null | undefined) {
  if (!email) return false;
  return platformAdminEmails().includes(email.trim().toLowerCase());
}

/** Whether platform administration is switched on for this deployment at all. */
export function platformAdminAccessConfigured() {
  return platformAdminEmails().length > 0;
}

/**
 * Records a successful Google sign-in and returns the actor.
 *
 * The caller must have checked the allowlist already; this only writes the
 * record that sessions and audit rows refer to.
 */
export async function recordPlatformAdminSignIn(input: { email: string; name: string }): Promise<PlatformAdminActor> {
  await preparePlatformAuthCollections();
  const database = await getDatabase();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim() || email;
  await collections(database).admins.updateOne(
    { email },
    { $set: { lastLoginAt: new Date(), name }, $setOnInsert: { createdAt: new Date(), email } },
    { upsert: true },
  );
  const admin = await collections(database).admins.findOne({ email });
  if (!admin) throw new Error("PLATFORM_ADMIN_NOT_RECORDED");
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
  // The allowlist is the authority, and it is checked here rather than only at
  // sign-in: taking an address out of the environment locks that person out on
  // their very next request, without anyone touching the database.
  if (!admin || !isAllowedPlatformAdmin(admin.email)) return null;
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
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    value: token,
  };
}

export const platformAdminSessionCookieName = ADMIN_SESSION_COOKIE;
