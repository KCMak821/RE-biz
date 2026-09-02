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

const adminPagePaths = [
  "/admin",
  "/admin/workspaces",
  "/admin/users",
  "/admin/usage",
  "/admin/audit-logs",
];

async function requestPage(path, token) {
  return fetch(`${baseUrl}${path}`, {
    headers: token ? { cookie: `receipt_session=${token}` } : {},
    redirect: "manual",
  });
}

test(
  "super admins can open every Platform Admin page",
  { concurrency: false },
  async () => {
    for (const path of [
      ...adminPagePaths,
      `/admin/workspaces/${fixture.workspaceAId}`,
    ]) {
      const response = await requestPage(path, fixture.superAdminToken);
      assert.equal(response.status, 200, `expected 200 for ${path}`);
    }
  },
);

test(
  "workspace owners are rejected server-side from every Platform Admin page",
  { concurrency: false },
  async () => {
    for (const path of [
      ...adminPagePaths,
      `/admin/workspaces/${fixture.workspaceAId}`,
    ]) {
      // The guard is a redirect from the server component, so a normal user
      // never receives the page markup — hiding the link is not what stops them.
      const response = await requestPage(path, fixture.userAToken);
      assert.ok(
        [302, 303, 307, 308].includes(response.status),
        `expected a redirect for ${path}, got ${response.status}`,
      );
      assert.equal(
        new URL(response.headers.get("location"), baseUrl).pathname,
        "/",
      );
    }
  },
);

test(
  "signed-out visitors are rejected server-side from every Platform Admin page",
  { concurrency: false },
  async () => {
    for (const path of adminPagePaths) {
      const response = await requestPage(path);
      assert.ok(
        [302, 303, 307, 308].includes(response.status),
        `expected a redirect for ${path}, got ${response.status}`,
      );
    }
  },
);

test(
  "the admin workspace view keeps one company's data out of another's",
  { concurrency: false },
  async () => {
    const a = await request(`/api/admin/workspaces/${fixture.workspaceAId}`, {
      token: fixture.superAdminToken,
    });
    const b = await request(`/api/admin/workspaces/${fixture.workspaceBId}`, {
      token: fixture.superAdminToken,
    });
    assert.equal(a.response.status, 200);
    assert.equal(b.response.status, 200);

    // The only seeded receipt belongs to Workspace B.
    assert.equal(a.body.workspace.usage.receipts, 0);
    assert.equal(b.body.workspace.usage.receipts, 1);

    const emailsInA = a.body.workspace.members.map((member) => member.email);
    const emailsInB = b.body.workspace.members.map((member) => member.email);
    assert.deepEqual(emailsInA, ["user-a@example.test"]);
    assert.deepEqual(emailsInB, ["user-b@example.test"]);
  },
);

test(
  "suspending a workspace blocks its users and reactivating restores them",
  { concurrency: false },
  async () => {
    const suspend = await request(
      `/api/admin/workspaces/${fixture.workspaceAId}`,
      {
        body: { status: "suspended" },
        method: "PATCH",
        token: fixture.superAdminToken,
      },
    );
    assert.equal(suspend.response.status, 200);

    const whileSuspended = await request("/api/receipts", {
      token: fixture.userAToken,
    });
    assert.equal(whileSuspended.response.status, 403);
    const page = await requestPage("/dashboard", fixture.userAToken);
    assert.equal(
      new URL(page.headers.get("location"), baseUrl).pathname,
      "/workspace-suspended",
    );

    const reactivate = await request(
      `/api/admin/workspaces/${fixture.workspaceAId}`,
      {
        body: { status: "active" },
        method: "PATCH",
        token: fixture.superAdminToken,
      },
    );
    assert.equal(reactivate.response.status, 200);

    // Nothing was deleted on the way through: the workspace works again.
    const afterReactivate = await request("/api/receipts", {
      token: fixture.userAToken,
    });
    assert.equal(afterReactivate.response.status, 200);
  },
);

test(
  "suspend, reactivate and feature switches are written to the audit log",
  { concurrency: false },
  async () => {
    await request(
      `/api/admin/workspaces/${fixture.workspaceAId}/features/receipts`,
      {
        body: { enabled: false },
        method: "PATCH",
        token: fixture.superAdminToken,
      },
    );
    const whileDisabled = await request("/api/receipts", {
      token: fixture.userAToken,
    });
    assert.equal(whileDisabled.response.status, 403);
    await request(
      `/api/admin/workspaces/${fixture.workspaceAId}/features/receipts`,
      {
        body: { enabled: true },
        method: "PATCH",
        token: fixture.superAdminToken,
      },
    );

    const logs = await request("/api/admin/audit-logs", {
      token: fixture.superAdminToken,
    });
    assert.equal(logs.response.status, 200);
    const actionsForA = logs.body.auditLogs
      .filter((log) => log.targetId.startsWith(fixture.workspaceAId.toHexString()))
      .map((log) => log.action);
    for (const action of [
      "WORKSPACE_SUSPENDED",
      "WORKSPACE_REACTIVATED",
      "FEATURE_DISABLED",
      "FEATURE_ENABLED",
    ]) {
      assert.ok(
        actionsForA.includes(action),
        `expected ${action} in the audit log`,
      );
    }

    const featureLog = logs.body.auditLogs.find(
      (log) => log.action === "FEATURE_DISABLED",
    );
    assert.equal(featureLog.metadata.featureKey, "receipts");
    assert.equal(featureLog.metadata.enabled, false);
    assert.equal(featureLog.actor.email, "super-admin@example.test");
  },
);

test(
  "filtering the audit log by company excludes other companies",
  { concurrency: false },
  async () => {
    const filtered = await request(
      `/api/admin/audit-logs?workspaceId=${fixture.workspaceAId}`,
      { token: fixture.superAdminToken },
    );
    assert.equal(filtered.response.status, 200);
    assert.ok(filtered.body.auditLogs.length > 0);
    for (const log of filtered.body.auditLogs) {
      assert.ok(
        log.targetId.startsWith(fixture.workspaceAId.toHexString()),
        `${log.targetId} does not belong to workspace A`,
      );
    }

    // A date window in the past matches nothing that was just written.
    const outOfRange = await request(
      "/api/admin/audit-logs?from=2000-01-01&to=2000-01-02",
      { token: fixture.superAdminToken },
    );
    assert.equal(outOfRange.body.auditLogs.length, 0);
  },
);

test(
  "workspace owners cannot read the platform user or audit endpoints",
  { concurrency: false },
  async () => {
    for (const path of [
      "/api/admin/overview",
      "/api/admin/users",
      "/api/admin/usage",
      "/api/admin/audit-logs",
    ]) {
      const result = await request(path, { token: fixture.userAToken });
      assert.equal(result.response.status, 403, `expected 403 for ${path}`);
    }
  },
);

test(
  "the platform user list reports one row per person with a workspace count",
  { concurrency: false },
  async () => {
    const result = await request("/api/admin/users", {
      token: fixture.superAdminToken,
    });
    assert.equal(result.response.status, 200);
    const ids = result.body.users.map((user) => user.id);
    assert.equal(new Set(ids).size, ids.length);
    const userA = result.body.users.find(
      (user) => user.email === "user-a@example.test",
    );
    assert.equal(userA.workspaceCount, 1);
    assert.equal(userA.workspaces[0].name, "Workspace A");
    const superAdmin = result.body.users.find(
      (user) => user.email === "super-admin@example.test",
    );
    assert.equal(superAdmin.platformRole, "SUPER_ADMIN");
  },
);

test(
  "the workspace list can be searched by name and by owner email",
  { concurrency: false },
  async () => {
    const byName = await request("/api/admin/workspaces?q=Workspace%20B", {
      token: fixture.superAdminToken,
    });
    assert.deepEqual(
      byName.body.workspaces.map((workspace) => workspace.name),
      ["Workspace B"],
    );

    const byOwner = await request("/api/admin/workspaces?q=user-a@example", {
      token: fixture.superAdminToken,
    });
    assert.deepEqual(
      byOwner.body.workspaces.map((workspace) => workspace.name),
      ["Workspace A"],
    );

    const noMatch = await request("/api/admin/workspaces?q=nothing-matches", {
      token: fixture.superAdminToken,
    });
    assert.deepEqual(noMatch.body.workspaces, []);
  },
);

/**
 * Whether the deployment under test can run multi-document transactions. The
 * bundled docker-compose MongoDB is a standalone server and cannot; a replica
 * set or Atlas can. The platform admin pairs each change with its audit record
 * in a transaction where one is available, and the guarantee it can offer
 * differs between the two, so the assertion below has to follow suit.
 */
async function supportsTransactions() {
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await database
        .collection("transactionProbe")
        .insertOne({ probe: true }, { session });
    });
    return true;
  } catch {
    return false;
  } finally {
    await session.endSession();
    await database
      .collection("transactionProbe")
      .drop()
      .catch(() => {});
  }
}

test(
  "a failed audit write never leaves an unlogged change behind",
  { concurrency: false },
  async () => {
    const transactional = await supportsTransactions();
    const auditLogsBefore = await database
      .collection("platformAuditLogs")
      .countDocuments();
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
    const workspace = await database
      .collection("organizations")
      .findOne({ _id: fixture.workspaceBId });

    if (transactional) {
      // The change and its audit record share one transaction, so an audit
      // failure rolls the change back rather than leaving it unlogged.
      assert.equal(result.response.status, 503);
      assert.notEqual(workspace?.status, "suspended");
    } else {
      // Without transactions the mutation is the source of truth: it is never
      // reported as failed because only its audit write failed, and the failure
      // is logged instead.
      assert.equal(result.response.status, 200);
      assert.equal(workspace?.status, "suspended");
      assert.equal(
        await waitFor(() =>
          serverOutput.includes(
            "Platform audit log write failed after a successful mutation",
          ),
        ),
        true,
      );
    }

    // Either way, no audit row was written for a change that was not logged.
    assert.equal(
      await database.collection("platformAuditLogs").countDocuments(),
      auditLogsBefore,
    );
  },
);
