import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
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

const planPayload = {
  allowances: { members: 5, quotationsPerMonth: 50, receiptsPerMonth: 100 },
  currency: "HKD",
  description: "Created by the test",
  features: ["receipts", "quotations"],
  isDefault: false,
  label: "測試方案",
  priceCents: 12345,
  sortOrder: 40,
};

/**
 * Stripe signs webhooks with an HMAC over the raw body, so a genuine signature
 * can be produced here without a Stripe account or any network access.
 */
const stripeWebhookSecret = "whsec_test_secret_for_integration_tests";
/** The one address PLATFORM_ADMIN_EMAILS grants access to in these tests. */
const allowedAdminEmail = "platform-admin@rebiz.test";

function stripeSignature(payload, timestampSeconds) {
  const signature = createHmac("sha256", stripeWebhookSecret)
    .update(`${timestampSeconds}.${payload}`)
    .digest("hex");
  return `t=${timestampSeconds},v1=${signature}`;
}

async function postStripeEvent(event, { signed = true, timestampSeconds } = {}) {
  const payload = JSON.stringify(event);
  const timestamp = timestampSeconds ?? Math.floor(Date.now() / 1000);
  const response = await fetch(`${baseUrl}/api/stripe/webhook`, {
    body: payload,
    headers: {
      "content-type": "application/json",
      "stripe-signature": signed ? stripeSignature(payload, timestamp) : "t=1,v1=deadbeef",
    },
    method: "POST",
  });
  return { body: await response.json().catch(() => null), response };
}

function subscriptionEvent({ customerId, eventId, priceId, status }) {
  return {
    data: {
      object: {
        current_period_end: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
        customer: customerId,
        id: "sub_test_1",
        items: { data: [{ price: { id: priceId } }] },
        status,
      },
    },
    id: eventId,
    type: "customer.subscription.updated",
  };
}

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

/**
  * `token` is a customer session; `adminToken` is a platform administrator's.
  * They are different cookies backed by different collections, which is the
  * whole point: neither can stand in for the other.
  */
async function request(path, { adminToken, body, method = "GET", token } = {}) {
  const cookies = [
    token ? `receipt_session=${token}` : null,
    adminToken ? `rebiz_admin_session=${adminToken}` : null,
  ].filter(Boolean);
  const response = await fetch(`${baseUrl}${path}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookies.length ? { cookie: cookies.join("; ") } : {}),
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

async function createAdminSession(adminId) {
  const token = randomBytes(32).toString("base64url");
  await database.collection("platformAdminSessions").insertOne({
    adminId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    tokenHash: sessionHash(token),
  });
  return token;
}

async function seedFixtures() {
  const now = new Date();
  const platformAdminId = new ObjectId();
  const removedAdminId = new ObjectId();
  const userAId = new ObjectId();
  const userBId = new ObjectId();
  const disabledUserId = new ObjectId();
  const workspaceAId = new ObjectId();
  const workspaceBId = new ObjectId();
  const receiptBId = new ObjectId();
  // Platform administrators are their own collection. Nothing here makes an
  // administrator a customer, and no customer row can grant platform access.
  // Administrators are records, not credentials: access comes from the
  // allowlist. The second row is deliberately absent from it.
  await database.collection("platformAdmins").insertMany([
    { _id: platformAdminId, createdAt: now, email: allowedAdminEmail, name: "Platform Admin" },
    { _id: removedAdminId, createdAt: now, email: "removed-admin@rebiz.test", name: "Removed Admin" },
  ]);
  await database.collection("users").insertMany([
    {
      _id: userAId,
      accountStatus: "active",
      createdAt: now,
      email: "user-a@example.test",
      name: "User A",
      passwordHash: "not-used-by-session-tests",
    },
    {
      _id: userBId,
      accountStatus: "active",
      createdAt: now,
      email: "user-b@example.test",
      name: "User B",
      passwordHash: "not-used-by-session-tests",
    },
    {
      _id: disabledUserId,
      accountStatus: "active",
      createdAt: now,
      email: "disabled@example.test",
      name: "Disabled User",
      passwordHash: "not-used-by-session-tests",
    },
  ]);
  await database.collection("plans").insertMany([
    {
      _id: "free",
      allowances: { members: 2, quotationsPerMonth: 10, receiptsPerMonth: 20 },
      archived: false,
      createdAt: now,
      currency: "HKD",
      description: "Seeded free plan",
      features: ["receipts", "accounting"],
      isDefault: true,
      label: "免費",
      priceCents: 0,
      sortOrder: 10,
      updatedAt: now,
    },
    {
      _id: "pro",
      allowances: { members: null, quotationsPerMonth: null, receiptsPerMonth: null },
      archived: false,
      createdAt: now,
      currency: "HKD",
      description: "Seeded pro plan",
      features: ["receipts", "accounting", "quotations", "invoices"],
      isDefault: false,
      label: "專業",
      priceCents: 19900,
      sortOrder: 30,
      updatedAt: now,
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
    adminToken: await createAdminSession(platformAdminId),
    platformAdminId,
    removedAdminToken: await createAdminSession(removedAdminId),
    receiptBId,
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
        PLATFORM_ADMIN_EMAILS: allowedAdminEmail,
        STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
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
      adminToken: fixture.adminToken,
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

async function requestPage(path, { adminToken, token } = {}) {
  const cookies = [
    token ? `receipt_session=${token}` : null,
    adminToken ? `rebiz_admin_session=${adminToken}` : null,
  ].filter(Boolean);
  return fetch(`${baseUrl}${path}`, {
    headers: cookies.length ? { cookie: cookies.join("; ") } : {},
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
      const response = await requestPage(path, { adminToken: fixture.adminToken });
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
      const response = await requestPage(path, { token: fixture.userAToken });
      assert.ok(
        [302, 303, 307, 308].includes(response.status),
        `expected a redirect for ${path}, got ${response.status}`,
      );
      assert.equal(
        new URL(response.headers.get("location"), baseUrl).pathname,
        "/admin/login",
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
      adminToken: fixture.adminToken,
    });
    const b = await request(`/api/admin/workspaces/${fixture.workspaceBId}`, {
      adminToken: fixture.adminToken,
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
        adminToken: fixture.adminToken,
      },
    );
    assert.equal(suspend.response.status, 200);

    const whileSuspended = await request("/api/receipts", {
      token: fixture.userAToken,
    });
    assert.equal(whileSuspended.response.status, 403);
    const page = await requestPage("/dashboard", { token: fixture.userAToken });
    assert.equal(
      new URL(page.headers.get("location"), baseUrl).pathname,
      "/workspace-suspended",
    );

    const reactivate = await request(
      `/api/admin/workspaces/${fixture.workspaceAId}`,
      {
        body: { status: "active" },
        method: "PATCH",
        adminToken: fixture.adminToken,
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
        adminToken: fixture.adminToken,
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
        adminToken: fixture.adminToken,
      },
    );

    const logs = await request("/api/admin/audit-logs", {
      adminToken: fixture.adminToken,
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
    assert.equal(featureLog.actor.email, "platform-admin@rebiz.test");
  },
);

test(
  "filtering the audit log by company excludes other companies",
  { concurrency: false },
  async () => {
    const filtered = await request(
      `/api/admin/audit-logs?workspaceId=${fixture.workspaceAId}`,
      { adminToken: fixture.adminToken },
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
      { adminToken: fixture.adminToken },
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
  "the platform user list is customers only, one row per person",
  { concurrency: false },
  async () => {
    const result = await request("/api/admin/users", {
      adminToken: fixture.adminToken,
    });
    assert.equal(result.response.status, 200);
    const ids = result.body.users.map((user) => user.id);
    assert.equal(new Set(ids).size, ids.length);
    const userA = result.body.users.find(
      (user) => user.email === "user-a@example.test",
    );
    assert.equal(userA.workspaceCount, 1);
    assert.equal(userA.workspaces[0].name, "Workspace A");
    assert.equal(
      result.body.users.some((user) => user.email === "platform-admin@rebiz.test"),
      false,
      "a platform administrator must never appear in the customer list",
    );
  },
);

test(
  "the workspace list can be searched by name and by owner email",
  { concurrency: false },
  async () => {
    const byName = await request("/api/admin/workspaces?q=Workspace%20B", {
      adminToken: fixture.adminToken,
    });
    assert.deepEqual(
      byName.body.workspaces.map((workspace) => workspace.name),
      ["Workspace B"],
    );

    const byOwner = await request("/api/admin/workspaces?q=user-a@example", {
      adminToken: fixture.adminToken,
    });
    assert.deepEqual(
      byOwner.body.workspaces.map((workspace) => workspace.name),
      ["Workspace A"],
    );

    const noMatch = await request("/api/admin/workspaces?q=nothing-matches", {
      adminToken: fixture.adminToken,
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
  "a platform admin cookie grants nothing in the product",
  { concurrency: false },
  async () => {
    // The reverse direction matters as much as the forward one: running the
    // platform must not hand anyone a way into a customer's records.
    for (const path of ["/api/receipts", "/api/quotes", "/api/ledger", "/api/invoices"]) {
      const result = await request(path, { adminToken: fixture.adminToken });
      assert.equal(result.response.status, 401, `expected 401 for ${path}`);
    }
    const page = await requestPage("/dashboard", { adminToken: fixture.adminToken });
    assert.equal(
      new URL(page.headers.get("location"), baseUrl).pathname,
      "/login",
    );
  },
);

test(
  "a customer cookie grants nothing in the back office, even for a company owner",
  { concurrency: false },
  async () => {
    for (const path of [
      "/api/admin/overview",
      "/api/admin/workspaces",
      "/api/admin/users",
      "/api/admin/audit-logs",
    ]) {
      const result = await request(path, { token: fixture.userAToken });
      assert.equal(result.response.status, 403, `expected 403 for ${path}`);
    }
  },
);

test(
  "the back office has its own door, and it is Google only",
  { concurrency: false },
  async () => {
    // The login page must stay reachable, or a locked-out admin has no way in.
    const loginPage = await requestPage("/admin/login");
    assert.equal(loginPage.status, 200);

    // The password endpoint is gone, not merely hidden.
    const passwordLogin = await request("/api/admin/auth/login", {
      body: { email: "user-a@example.test", password: "whatever-they-use" },
      method: "POST",
    });
    assert.equal(passwordLogin.response.status, 404);
  },
);

test(
  "removing an address from the allowlist ends that administrator's access",
  { concurrency: false },
  async () => {
    // Both sessions are real and unexpired; only the allowlist separates them.
    const allowed = await request("/api/admin/overview", { adminToken: fixture.adminToken });
    assert.equal(allowed.response.status, 200);

    const removed = await request("/api/admin/overview", { adminToken: fixture.removedAdminToken });
    assert.equal(removed.response.status, 403);

    const page = await requestPage("/admin", { adminToken: fixture.removedAdminToken });
    assert.equal(
      new URL(page.headers.get("location"), baseUrl).pathname,
      "/admin/login",
    );
  },
);

test(
  "the Google sign-in hand-off is guarded on the way out and on the way back",
  { concurrency: false },
  async () => {
    // Google is not configured for the test server, so starting the flow says
    // so rather than sending anyone to a half-built redirect.
    const start = await fetch(`${baseUrl}/api/admin/auth/google/start`, { redirect: "manual" });
    assert.ok([302, 303, 307, 308].includes(start.status));
    const startTarget = new URL(start.headers.get("location"), baseUrl);
    assert.equal(startTarget.pathname, "/admin/login");
    assert.equal(startTarget.searchParams.get("error"), "not_configured");

    // A callback nobody started carries no matching state and signs in no one.
    const forgedCallback = await fetch(
      `${baseUrl}/api/admin/auth/google/callback?code=stolen&state=guessed`,
      { redirect: "manual" },
    );
    const callbackTarget = new URL(forgedCallback.headers.get("location"), baseUrl);
    assert.equal(callbackTarget.pathname, "/admin/login");
    assert.ok(["bad_state", "not_configured"].includes(callbackTarget.searchParams.get("error")));
    // Nothing was issued.
    assert.equal((forgedCallback.headers.get("set-cookie") ?? "").includes("rebiz_admin_session="), false);
  },
);

test(
  "a workspace with no subscription record reads as the default plan",
  { concurrency: false },
  async () => {
    // The fixtures seed no subscription, which is what every company looked
    // like before subscriptions existed.
    const result = await request(`/api/admin/workspaces/${fixture.workspaceAId}`, {
      adminToken: fixture.adminToken,
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.workspace.subscription.planKey, "free");
    assert.equal(result.body.workspace.subscription.status, "active");
    assert.equal(result.body.workspace.subscription.currentPeriodEnd, null);
  },
);

test(
  "changing a plan is recorded, audited, and changes nothing a customer can do",
  { concurrency: false },
  async () => {
    const before = await request("/api/receipts", { token: fixture.userAToken });
    assert.equal(before.response.status, 200);

    const change = await request(
      `/api/admin/workspaces/${fixture.workspaceAId}/subscription`,
      {
        adminToken: fixture.adminToken,
        body: { planKey: "pro", status: "trialing", trialEndsAt: "2027-01-31" },
        method: "PATCH",
      },
    );
    assert.equal(change.response.status, 200);

    const workspace = await request(`/api/admin/workspaces/${fixture.workspaceAId}`, {
      adminToken: fixture.adminToken,
    });
    assert.equal(workspace.body.workspace.subscription.planKey, "pro");
    assert.equal(workspace.body.workspace.subscription.status, "trialing");
    assert.ok(workspace.body.workspace.subscription.trialEndsAt.startsWith("2027-01-31"));

    // Recording a plan must not become an entitlement change by accident: the
    // customer can do exactly what they could before.
    const after = await request("/api/receipts", { token: fixture.userAToken });
    assert.equal(after.response.status, 200);

    const logs = await request(
      `/api/admin/audit-logs?workspaceId=${fixture.workspaceAId}`,
      { adminToken: fixture.adminToken },
    );
    const planChange = logs.body.auditLogs.find(
      (log) => log.action === "SUBSCRIPTION_PLAN_CHANGED",
    );
    assert.ok(planChange, "expected SUBSCRIPTION_PLAN_CHANGED in the audit log");
    assert.equal(planChange.metadata.fromPlan, "free");
    assert.equal(planChange.metadata.toPlan, "pro");
    assert.equal(planChange.actor.email, "platform-admin@rebiz.test");

    await request(`/api/admin/workspaces/${fixture.workspaceAId}/subscription`, {
      adminToken: fixture.adminToken,
      body: { planKey: "free", status: "active", trialEndsAt: null },
      method: "PATCH",
    });
  },
);

test(
  "the subscription endpoint rejects unknown plans and non-admins",
  { concurrency: false },
  async () => {
    // A well-formed key that names no plan is a 404: whether a plan exists is
    // decided against the stored plans, not by the schema.
    const missingPlan = await request(
      `/api/admin/workspaces/${fixture.workspaceAId}/subscription`,
      { adminToken: fixture.adminToken, body: { planKey: "enterprise" }, method: "PATCH" },
    );
    assert.equal(missingPlan.response.status, 404);

    // A malformed key never reaches the lookup.
    const malformedPlan = await request(
      `/api/admin/workspaces/${fixture.workspaceAId}/subscription`,
      { adminToken: fixture.adminToken, body: { planKey: "Not A Key!" }, method: "PATCH" },
    );
    assert.equal(malformedPlan.response.status, 400);

    const asCustomer = await request(
      `/api/admin/workspaces/${fixture.workspaceAId}/subscription`,
      { body: { planKey: "pro" }, method: "PATCH", token: fixture.userAToken },
    );
    assert.equal(asCustomer.response.status, 403);
  },
);

test(
  "usage reports the current month separately from the running total",
  { concurrency: false },
  async () => {
    const result = await request(`/api/admin/workspaces/${fixture.workspaceBId}`, {
      adminToken: fixture.adminToken,
    });
    const usage = result.body.workspace.usage;
    // The seeded receipt for Workspace B is created with the fixture, so it
    // counts in both the total and the current month.
    assert.equal(usage.receipts, 1);
    assert.equal(usage.thisMonth.receipts, 1);
    assert.equal(usage.thisMonth.quotations, 0);
  },
);

test(
  "the workspace list can be filtered by plan and by subscription status",
  { concurrency: false },
  async () => {
    await request(`/api/admin/workspaces/${fixture.workspaceBId}/subscription`, {
      adminToken: fixture.adminToken,
      body: { planKey: "pro", status: "past_due" },
      method: "PATCH",
    });
    try {
      const byPlan = await request("/api/admin/workspaces?plan=pro", {
        adminToken: fixture.adminToken,
      });
      assert.deepEqual(
        byPlan.body.workspaces.map((workspace) => workspace.name),
        ["Workspace B"],
      );

      const byStatus = await request("/api/admin/workspaces?subscription=past_due", {
        adminToken: fixture.adminToken,
      });
      assert.deepEqual(
        byStatus.body.workspaces.map((workspace) => workspace.name),
        ["Workspace B"],
      );

      // An unknown filter value is ignored rather than returning nothing, so a
      // stale bookmark does not look like "no companies exist".
      const nonsense = await request("/api/admin/workspaces?plan=enterprise", {
        adminToken: fixture.adminToken,
      });
      assert.equal(nonsense.body.workspaces.length >= 2, true);
    } finally {
      await request(`/api/admin/workspaces/${fixture.workspaceBId}/subscription`, {
        adminToken: fixture.adminToken,
        body: { planKey: "free", status: "active" },
        method: "PATCH",
      });
    }
  },
);

test(
  "a plan whose features do not match the switches is reported as drift",
  { concurrency: false },
  async () => {
    const features = database.collection("workspaceFeatures");
    // "free" does not include quotations, so leaving it switched on is drift.
    const clean = await request(`/api/admin/workspaces/${fixture.workspaceAId}`, {
      adminToken: fixture.adminToken,
    });
    assert.deepEqual(clean.body.workspace.drift.extra.sort(), ["invoices", "quotations"]);
    assert.deepEqual(clean.body.workspace.drift.missing, []);

    await features.updateOne(
      { featureKey: "receipts", organizationId: fixture.workspaceAId },
      { $set: { enabled: false, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    try {
      const drifted = await request(`/api/admin/workspaces/${fixture.workspaceAId}`, {
        adminToken: fixture.adminToken,
      });
      // Receipts are part of "free" but now switched off.
      assert.deepEqual(drifted.body.workspace.drift.missing, ["receipts"]);
    } finally {
      await features.updateOne(
        { featureKey: "receipts", organizationId: fixture.workspaceAId },
        { $set: { enabled: true, updatedAt: new Date() } },
      );
    }
  },
);

test(
  "an expired trial is surfaced for a human rather than acted on",
  { concurrency: false },
  async () => {
    await request(`/api/admin/workspaces/${fixture.workspaceAId}/subscription`, {
      adminToken: fixture.adminToken,
      body: { status: "trialing", trialEndsAt: "2020-01-01" },
      method: "PATCH",
    });
    try {
      const overview = await request("/api/admin/overview", {
        adminToken: fixture.adminToken,
      });
      const row = overview.body.overview.attention.find(
        (entry) => entry.id === fixture.workspaceAId.toHexString(),
      );
      assert.ok(row, "expected the workspace in the attention list");
      assert.ok(row.reasons.includes("trial_expired"));

      // Surfaced, not enforced: the workspace still works and is still active.
      const stillWorks = await request("/api/receipts", { token: fixture.userAToken });
      assert.equal(stillWorks.response.status, 200);
      const workspace = await database
        .collection("organizations")
        .findOne({ _id: fixture.workspaceAId });
      assert.notEqual(workspace.status, "suspended");
    } finally {
      await request(`/api/admin/workspaces/${fixture.workspaceAId}/subscription`, {
        adminToken: fixture.adminToken,
        body: { status: "active", trialEndsAt: null },
        method: "PATCH",
      });
    }
  },
);

test(
  "plans are stored data: they can be created and priced from the admin",
  { concurrency: false },
  async () => {
    const created = await request("/api/admin/plans", {
      adminToken: fixture.adminToken,
      body: { ...planPayload, key: "test-plan" },
      method: "POST",
    });
    assert.equal(created.response.status, 200);

    const list = await request("/api/admin/plans", { adminToken: fixture.adminToken });
    const plan = list.body.plans.find((entry) => entry.key === "test-plan");
    assert.ok(plan, "expected the new plan in the list");
    assert.equal(plan.priceCents, 12345);
    assert.equal(plan.workspaceCount, 0);

    // Raising the price is an edit, not a deploy.
    const repriced = await request("/api/admin/plans/test-plan", {
      adminToken: fixture.adminToken,
      body: { ...planPayload, priceCents: 25000 },
      method: "PATCH",
    });
    assert.equal(repriced.response.status, 200);
    const afterEdit = await request("/api/admin/plans", { adminToken: fixture.adminToken });
    assert.equal(
      afterEdit.body.plans.find((entry) => entry.key === "test-plan").priceCents,
      25000,
    );

    const logs = await request("/api/admin/audit-logs", { adminToken: fixture.adminToken });
    assert.ok(logs.body.auditLogs.some((log) => log.action === "PLAN_CREATED"));
    const updated = logs.body.auditLogs.find((log) => log.action === "PLAN_UPDATED");
    assert.equal(updated.metadata.fromPriceCents, 12345);
    assert.equal(updated.metadata.toPriceCents, 25000);
  },
);

test(
  "repricing a plan does not rewrite what existing companies are recorded at",
  { concurrency: false },
  async () => {
    // Put Workspace B on "pro" at its current price.
    await request(`/api/admin/workspaces/${fixture.workspaceBId}/subscription`, {
      adminToken: fixture.adminToken,
      body: { planKey: "pro" },
      method: "PATCH",
    });
    const before = await request(`/api/admin/workspaces/${fixture.workspaceBId}`, {
      adminToken: fixture.adminToken,
    });
    assert.equal(before.body.workspace.subscription.priceCents, 19900);

    await request("/api/admin/plans/pro", {
      adminToken: fixture.adminToken,
      body: {
        allowances: { members: null, quotationsPerMonth: null, receiptsPerMonth: null },
        currency: "HKD",
        description: "Seeded pro plan",
        features: ["receipts", "accounting", "quotations", "invoices"],
        isDefault: false,
        label: "專業",
        priceCents: 29900,
        sortOrder: 30,
      },
      method: "PATCH",
    });

    // The company keeps the price it was put on; only the plan moved.
    const after = await request(`/api/admin/workspaces/${fixture.workspaceBId}`, {
      adminToken: fixture.adminToken,
    });
    assert.equal(after.body.workspace.subscription.priceCents, 19900);
    assert.equal(after.body.workspace.subscription.planKey, "pro");

    await request(`/api/admin/workspaces/${fixture.workspaceBId}/subscription`, {
      adminToken: fixture.adminToken,
      body: { planKey: "free" },
      method: "PATCH",
    });
  },
);

test(
  "the default plan cannot be archived and archived plans cannot be assigned",
  { concurrency: false },
  async () => {
    const archiveDefault = await request("/api/admin/plans/free", {
      adminToken: fixture.adminToken,
      body: { archived: true },
      method: "PATCH",
    });
    assert.equal(archiveDefault.response.status, 409);

    await request("/api/admin/plans/test-plan", {
      adminToken: fixture.adminToken,
      body: { archived: true },
      method: "PATCH",
    });
    const assignArchived = await request(
      `/api/admin/workspaces/${fixture.workspaceAId}/subscription`,
      { adminToken: fixture.adminToken, body: { planKey: "test-plan" }, method: "PATCH" },
    );
    assert.equal(assignArchived.response.status, 404);

    // Archiving withdraws a plan; it never deletes it.
    const list = await request("/api/admin/plans", { adminToken: fixture.adminToken });
    assert.equal(list.body.plans.find((entry) => entry.key === "test-plan").archived, true);
  },
);

test(
  "plan endpoints are closed to customers",
  { concurrency: false },
  async () => {
    const read = await request("/api/admin/plans", { token: fixture.userAToken });
    assert.equal(read.response.status, 403);
    const write = await request("/api/admin/plans", {
      body: { ...planPayload, label: "Nope" },
      method: "POST",
      token: fixture.userAToken,
    });
    assert.equal(write.response.status, 403);
  },
);

test(
  "the Stripe webhook refuses anything it cannot verify",
  { concurrency: false },
  async () => {
    const event = subscriptionEvent({
      customerId: "cus_unlinked",
      eventId: "evt_bad_signature",
      priceId: "price_pro",
      status: "active",
    });

    const forged = await postStripeEvent(event, { signed: false });
    assert.equal(forged.response.status, 400);

    // A genuine signature from hours ago is a replay, not a valid request.
    const stale = await postStripeEvent(event, {
      timestampSeconds: Math.floor(Date.now() / 1000) - 60 * 60,
    });
    assert.equal(stale.response.status, 400);

    // Nothing was recorded by either attempt.
    assert.equal(await database.collection("stripeEvents").countDocuments({ _id: "evt_bad_signature" }), 0);
  },
);

test(
  "a verified Stripe event only reaches a company that was deliberately linked",
  { concurrency: false },
  async () => {
    const unmatched = await postStripeEvent(
      subscriptionEvent({
        customerId: "cus_never_linked",
        eventId: "evt_no_match",
        priceId: "price_pro",
        status: "active",
      }),
    );
    // Acknowledged, because Stripe retries anything else forever.
    assert.equal(unmatched.response.status, 200);
    assert.equal(unmatched.body.outcome, "no_match");
  },
);

test(
  "Stripe drives the recorded subscription but never suspends anyone",
  { concurrency: false },
  async () => {
    await database.collection("plans").updateOne(
      { _id: "pro" },
      { $set: { stripePriceId: "price_pro_monthly" } },
    );
    await request(`/api/admin/workspaces/${fixture.workspaceAId}/subscription`, {
      adminToken: fixture.adminToken,
      body: { externalCustomerId: "cus_workspace_a" },
      method: "PATCH",
    });

    const failed = await postStripeEvent({
      data: { object: { customer: "cus_workspace_a", id: "in_1", subscription: "sub_a" } },
      id: "evt_payment_failed",
      type: "invoice.payment_failed",
    });
    assert.equal(failed.body.outcome, "applied");

    const afterFailure = await request(`/api/admin/workspaces/${fixture.workspaceAId}`, {
      adminToken: fixture.adminToken,
    });
    assert.equal(afterFailure.body.workspace.subscription.status, "past_due");
    // The whole point: a failed payment is a note for a human, not a cut-off.
    assert.equal(afterFailure.body.workspace.status, "active");
    const stillWorks = await request("/api/receipts", { token: fixture.userAToken });
    assert.equal(stillWorks.response.status, 200);

    // A subscription event carrying a mapped price moves the plan too.
    const activated = await postStripeEvent(
      subscriptionEvent({
        customerId: "cus_workspace_a",
        eventId: "evt_now_active",
        priceId: "price_pro_monthly",
        status: "active",
      }),
    );
    assert.equal(activated.body.outcome, "applied");
    const afterActive = await request(`/api/admin/workspaces/${fixture.workspaceAId}`, {
      adminToken: fixture.adminToken,
    });
    assert.equal(afterActive.body.workspace.subscription.status, "active");
    assert.equal(afterActive.body.workspace.subscription.planKey, "pro");
    assert.equal(afterActive.body.workspace.subscription.externalSubscriptionId, "sub_test_1");

    // Stripe redelivers; the second copy must change nothing.
    const replay = await postStripeEvent(
      subscriptionEvent({
        customerId: "cus_workspace_a",
        eventId: "evt_now_active",
        priceId: "price_pro_monthly",
        status: "canceled",
      }),
    );
    assert.equal(replay.body.outcome, "duplicate");
    const afterReplay = await request(`/api/admin/workspaces/${fixture.workspaceAId}`, {
      adminToken: fixture.adminToken,
    });
    assert.equal(afterReplay.body.workspace.subscription.status, "active");

    // Restore the fixture for the tests that follow.
    await request(`/api/admin/workspaces/${fixture.workspaceAId}/subscription`, {
      adminToken: fixture.adminToken,
      body: { externalCustomerId: null, planKey: "free", status: "active" },
      method: "PATCH",
    });
  },
);

test(
  "an unrecognised Stripe event is acknowledged and changes nothing",
  { concurrency: false },
  async () => {
    const result = await postStripeEvent({
      data: { object: { id: "cs_test" } },
      id: "evt_unknown_type",
      type: "checkout.session.completed",
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.ignored, true);
  },
);

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
        adminToken: fixture.adminToken,
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
