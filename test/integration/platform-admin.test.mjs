import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";

import { MongoClient, ObjectId } from "mongodb";

import { stopChildProcess } from "./child-process.mjs";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
);
const localHosts = new Set(["127.0.0.1", "::1", "localhost"]);
const databaseName = `receipt_issuer_test_${process.pid}_${randomBytes(6).toString("hex")}`;
const mongoUri = process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27018";
const parsedMongoUri = new URL(mongoUri.replace(/^mongodb(\+srv)?:/, "http:"));

if (!localHosts.has(parsedMongoUri.hostname)) {
  throw new Error(
    "Integration tests only accept a local TEST_MONGODB_URI to prevent production database access.",
  );
}

const client = new MongoClient(mongoUri, {
  appName: "receipt-issuer-integration-tests",
  serverSelectionTimeoutMS: 10_000,
});
const database = client.db(databaseName);
let baseUrl = "";
let nextProcess;
let serverOutput = "";
let fixture;
let databaseConnected = false;

const receiptPayload = {
  amount: 100,
  businessRegistration: "",
  description: "Integration test receipt",
  issueDate: "2026-08-31",
  issuerAddress: "",
  issuerContact: "",
  issuerName: "Workspace A",
  notes: "",
  payerAddress: "",
  payerName: "Test payer",
  paymentMethod: "Cash",
};
const ledgerPayload = {
  amount: 100,
  date: "2026-08-31",
  description: "Integration test ledger entry",
  type: "IN",
};
const quotePayload = {
  customer: {
    address: "",
    contact: "",
    email: "",
    name: "Test customer",
    notes: "",
    phone: "",
  },
  issueDate: "2026-08-31",
  lines: [
    {
      description: "",
      discountAmount: 0,
      name: "Test line",
      quantity: 1,
      unitPrice: 100,
    },
  ],
  notes: "",
  terms: "",
  validUntil: "2026-09-30",
};

function sessionHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function availablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  await new Promise((resolveClose) => server.close(resolveClose));
  if (!address || typeof address === "string")
    throw new Error("Could not reserve a local port for integration tests.");
  return address.port;
}

async function waitFor(check, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  return false;
}

async function request(path, { body, method = "GET", token } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { cookie: `receipt_session=${token}` } : {}),
    },
    method,
  });
  return { body: await response.json().catch(() => null), response };
}

async function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  await database.collection("sessions").insertOne({
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    tokenHash: sessionHash(token),
    userId,
  });
  return token;
}

async function seedFixtures() {
  const now = new Date();
  const superAdminId = new ObjectId();
  const userAId = new ObjectId();
  const userBId = new ObjectId();
  const disabledUserId = new ObjectId();
  const workspaceAId = new ObjectId();
  const workspaceBId = new ObjectId();
  const receiptBId = new ObjectId();
  await database.collection("users").insertMany([
    {
      _id: superAdminId,
      accountStatus: "active",
      createdAt: now,
      email: "super-admin@example.test",
      name: "Super Admin",
      passwordHash: "not-used-by-session-tests",
      platformRole: "SUPER_ADMIN",
    },
    {
      _id: userAId,
      accountStatus: "active",
      createdAt: now,
      email: "user-a@example.test",
      name: "User A",
      passwordHash: "not-used-by-session-tests",
      platformRole: "USER",
    },
    {
      _id: userBId,
      accountStatus: "active",
      createdAt: now,
      email: "user-b@example.test",
      name: "User B",
      passwordHash: "not-used-by-session-tests",
      platformRole: "USER",
    },
    {
      _id: disabledUserId,
      accountStatus: "active",
      createdAt: now,
      email: "disabled@example.test",
      name: "Disabled User",
      passwordHash: "not-used-by-session-tests",
      platformRole: "USER",
    },
  ]);
  await database.collection("organizations").insertMany([
    {
      _id: workspaceAId,
      createdAt: now,
      createdBy: userAId,
      currency: "HKD",
      name: "Workspace A",
      status: "active",
      timeZone: "Asia/Hong_Kong",
    },
    {
      _id: workspaceBId,
      createdAt: now,
      createdBy: userBId,
      currency: "HKD",
      name: "Workspace B",
      status: "active",
      timeZone: "Asia/Hong_Kong",
    },
  ]);
  await database.collection("memberships").insertMany([
    {
      createdAt: now,
      createdBy: userAId,
      organizationId: workspaceAId,
      role: "owner",
      status: "active",
      userId: userAId,
    },
    {
      createdAt: now,
      createdBy: userBId,
      organizationId: workspaceBId,
      role: "owner",
      status: "active",
      userId: userBId,
    },
  ]);
  await database.collection("receipts").insertOne({
    _id: receiptBId,
    amount: 88,
    businessRegistration: "",
    createdAt: now,
    createdBy: userBId,
    description: "Receipt B private data",
    issueDate: "2026-08-31",
    issuerAddress: "",
    issuerContact: "",
    issuerName: "Workspace B",
    notes: "",
    organizationId: workspaceBId,
    payerAddress: "",
    payerName: "Workspace B customer",
    paymentMethod: "Cash",
    paymentStatus: "paid",
    receiptNumber: "RC-20260831-001",
    updatedAt: now,
  });
  return {
    receiptBId,
    superAdminToken: await createSession(superAdminId),
    userAToken: await createSession(userAId),
    disabledUserId,
    disabledUserToken: await createSession(disabledUserId),
    workspaceAId,
    workspaceBId,
  };
}

before(async () => {
  await client.connect();
  databaseConnected = true;
  await database.dropDatabase();
  fixture = await seedFixtures();
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const nextCli = resolve(
    repositoryRoot,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
  nextProcess = spawn(
    process.execPath,
    [
      nextCli,
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        MONGODB_DB: databaseName,
        MONGODB_URI: mongoUri,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  nextProcess.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  nextProcess.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  const ready = await waitFor(async () => {
    try {
      return (await fetch(`${baseUrl}/api/auth/session`)).status === 200;
    } catch {
      return false;
    }
  });
  if (!ready)
    throw new Error(
      `Next.js integration server did not start.\n${serverOutput}`,
    );
});

after(async () => {
  let cleanupError;
  try {
    if (!(await stopChildProcess(nextProcess)))
      cleanupError = new Error("Next.js integration server did not stop.");
  } catch (error) {
    cleanupError = error;
  }
  if (databaseConnected) {
    try {
      await database.dropDatabase();
    } catch (error) {
      cleanupError ??= error;
    }
  }
  try {
    await client.close();
  } catch (error) {
    cleanupError ??= error;
  }
  if (cleanupError) throw cleanupError;
});

test(
  "normal workspace users cannot bypass the Platform Admin API",
  { concurrency: false },
  async () => {
    const list = await request("/api/admin/workspaces", {
      token: fixture.userAToken,
    });
    assert.equal(list.response.status, 403);
    const mutation = await request(
      `/api/admin/workspaces/${fixture.workspaceAId}`,
      {
        body: { status: "suspended" },
        method: "PATCH",
        token: fixture.userAToken,
      },
    );
    assert.equal(mutation.response.status, 403);
  },
);

test(
  "super admins can list platform workspaces",
  { concurrency: false },
  async () => {
    const result = await request("/api/admin/workspaces", {
      token: fixture.superAdminToken,
    });
    assert.equal(result.response.status, 200);
    assert.ok(
      result.body.workspaces.some(
        (workspace) => workspace.id === fixture.workspaceAId.toHexString(),
      ),
    );
    assert.ok(
      result.body.workspaces.some(
        (workspace) => workspace.id === fixture.workspaceBId.toHexString(),
      ),
    );
  },
);

test(
  "workspace users cannot read or operate on another tenant's receipts",
  { concurrency: false },
  async () => {
    const list = await request("/api/receipts", { token: fixture.userAToken });
    assert.equal(list.response.status, 200);
    assert.ok(
      !list.body.receipts.some(
        (receipt) => receipt.id === fixture.receiptBId.toHexString(),
      ),
    );
    const update = await request(`/api/receipts/${fixture.receiptBId}`, {
      body: { paymentStatus: "paid" },
      method: "PUT",
      token: fixture.userAToken,
    });
    assert.equal(update.response.status, 404);
  },
);

test(
  "suspended workspaces are blocked from receipt, accounting, and quotation mutations",
  { concurrency: false },
  async () => {
    await database
      .collection("organizations")
      .updateOne(
        { _id: fixture.workspaceAId },
        { $set: { status: "suspended" } },
      );
    try {
      const receipt = await request("/api/receipts", {
        body: { receipts: [receiptPayload] },
        method: "POST",
        token: fixture.userAToken,
      });
      const ledger = await request("/api/ledger", {
        body: ledgerPayload,
        method: "POST",
        token: fixture.userAToken,
      });
      const quote = await request("/api/quotes", {
        body: quotePayload,
        method: "POST",
        token: fixture.userAToken,
      });
      assert.equal(receipt.response.status, 403);
      assert.equal(ledger.response.status, 403);
      assert.equal(quote.response.status, 403);
    } finally {
      await database
        .collection("organizations")
        .updateOne(
          { _id: fixture.workspaceAId },
          { $set: { status: "active" } },
        );
    }
  },
);

test(
  "workspace feature flags block APIs and allow them again after re-enabling",
  { concurrency: false },
  async () => {
    const features = database.collection("workspaceFeatures");
    await features.updateOne(
      { organizationId: fixture.workspaceAId, featureKey: "receipts" },
      {
        $set: { enabled: false, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
    const receiptRead = await request("/api/receipts", {
      token: fixture.userAToken,
    });
    const receiptWrite = await request("/api/receipts", {
      body: { receipts: [receiptPayload] },
      method: "POST",
      token: fixture.userAToken,
    });
    assert.equal(receiptRead.response.status, 403);
    assert.equal(receiptWrite.response.status, 403);

    await features.updateOne(
      { organizationId: fixture.workspaceAId, featureKey: "quotations" },
      {
        $set: { enabled: false, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
    const quotationRead = await request("/api/quotes", {
      token: fixture.userAToken,
    });
    assert.equal(quotationRead.response.status, 403);

    await features.updateOne(
      { organizationId: fixture.workspaceAId, featureKey: "receipts" },
      { $set: { enabled: true, updatedAt: new Date() } },
    );
    const receiptReadAfterEnable = await request("/api/receipts", {
      token: fixture.userAToken,
    });
    assert.equal(receiptReadAfterEnable.response.status, 200);
    await features.updateOne(
      { organizationId: fixture.workspaceAId, featureKey: "quotations" },
      { $set: { enabled: true, updatedAt: new Date() } },
    );
    const quotationReadAfterEnable = await request("/api/quotes", {
      token: fixture.userAToken,
    });
    assert.equal(quotationReadAfterEnable.response.status, 200);
  },
);

test(
  "disabled users cannot continue using an existing session",
  { concurrency: false },
  async () => {
    await database
      .collection("users")
      .updateOne(
        { _id: fixture.disabledUserId },
        { $set: { accountStatus: "disabled" } },
      );
    const result = await request("/api/receipts", {
      token: fixture.disabledUserToken,
    });
    assert.equal(result.response.status, 401);
  },
);

test(
  "successful admin mutations still return success when audit logging fails",
  { concurrency: false },
  async () => {
    await database.command({
      collMod: "platformAuditLogs",
      validationAction: "error",
      validationLevel: "strict",
      validator: {
        $jsonSchema: { bsonType: "object", required: ["auditWriteMustFail"] },
      },
    });
    const result = await request(
      `/api/admin/workspaces/${fixture.workspaceBId}`,
      {
        body: { status: "suspended" },
        method: "PATCH",
        token: fixture.superAdminToken,
      },
    );
    assert.equal(result.response.status, 200);
    const workspace = await database
      .collection("organizations")
      .findOne({ _id: fixture.workspaceBId });
    assert.equal(workspace?.status, "suspended");
    assert.equal(
      await database.collection("platformAuditLogs").countDocuments(),
      0,
    );
    assert.equal(
      await waitFor(() =>
        serverOutput.includes(
          "Platform audit log write failed after a successful mutation",
        ),
      ),
      true,
    );
  },
);
