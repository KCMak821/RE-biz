import { hash } from "bcryptjs";
import { MongoClient, ObjectId } from "mongodb";

export const E2E_DATABASE = "receipt_issuer_e2e";
export const E2E_MONGODB_URI = process.env.TEST_MONGODB_URI ?? "mongodb://127.0.0.1:27018";

export const owner = { email: "e2e-owner@rebiz.test", name: "E2E 擁有者", password: "e2e-owner-password-2026" };
export const viewer = { email: "e2e-viewer@rebiz.test", name: "E2E 檢視者", password: "e2e-viewer-password-2026" };
export const operator = { email: "e2e-operator@rebiz.test", name: "E2E 操作員", password: "e2e-operator-password-2026" };
/** Owner of a second, unrelated company — the other side of the tenant boundary. */
export const outsider = { email: "e2e-outsider@other.test", name: "E2E 外部公司擁有者", password: "e2e-outsider-password-2026" };
export const customerName = "E2E 客戶有限公司";

/**
 * Rebuilds a known workspace before the suite runs.
 *
 * The database name is dedicated to these tests, so a full drop is safe and
 * makes every run start from the same state.
 */
export default async function globalSetup() {
  const parsed = new URL(E2E_MONGODB_URI.replace(/^mongodb(\+srv)?:/, "http:"));
  if (!new Set(["127.0.0.1", "::1", "localhost"]).has(parsed.hostname)) {
    throw new Error("E2E tests only accept a local TEST_MONGODB_URI.");
  }

  const client = new MongoClient(E2E_MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  try {
    const database = client.db(E2E_DATABASE);
    await database.dropDatabase();

    const organizationId = new ObjectId();
    const otherOrganizationId = new ObjectId();
    const ownerId = new ObjectId();
    const viewerId = new ObjectId();
    const operatorId = new ObjectId();
    const outsiderId = new ObjectId();
    const now = new Date();

    await database.collection("organizations").insertOne({
      _id: organizationId,
      address: "香港九龍尖沙咀 1 號",
      bankDetails: "HSBC 004 · 000-111222-838",
      businessRegistration: "12345678",
      contact: "+852 1000 2000 · e2e@rebiz.test",
      createdAt: now,
      createdBy: ownerId,
      currency: "HKD",
      email: "e2e@rebiz.test",
      name: "E2E 測試公司",
      phone: "+852 1000 2000",
      status: "active",
      timeZone: "Asia/Hong_Kong",
    });

    // A second company, so "another workspace cannot reach this data" is testable
    // through the real UI rather than only in the API tests.
    await database.collection("organizations").insertOne({
      _id: otherOrganizationId,
      createdAt: now,
      createdBy: outsiderId,
      currency: "HKD",
      name: "E2E 外部公司",
      status: "active",
      timeZone: "Asia/Hong_Kong",
    });

    for (const [id, person, role, organization] of [
      [ownerId, owner, "owner", organizationId],
      [viewerId, viewer, "viewer", organizationId],
      [operatorId, operator, "operator", organizationId],
      [outsiderId, outsider, "owner", otherOrganizationId],
    ] as const) {
      await database.collection("users").insertOne({
        _id: id,
        accountStatus: "active",
        createdAt: now,
        email: person.email,
        mustChangePassword: false,
        name: person.name,
        passwordHash: await hash(person.password, 10),
      });
      await database.collection("memberships").insertOne({
        createdAt: now,
        createdBy: ownerId,
        organizationId: organization,
        role,
        status: "active",
        userId: id,
      });
    }

    // One saved customer, so the quote and invoice editors have something to pick.
    await database.collection("customers").insertOne({
      address: "香港島中環 2 號",
      businessRegistration: "87654321",
      companyName: customerName,
      contact: "陳先生",
      createdAt: now,
      createdBy: ownerId,
      email: "customer@rebiz.test",
      name: customerName,
      notes: "",
      organizationId,
      phone: "+852 3000 4000",
      status: "active",
      updatedAt: now,
    });
  } finally {
    await client.close();
  }
}
