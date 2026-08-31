import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

import { MongoClient, ObjectId } from "mongodb";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
);
const databaseName = `receipt_issuer_customer_test_${process.pid}_${randomBytes(6).toString("hex")}`;
const mongoUri = process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27018";
const parsedMongoUri = new URL(mongoUri.replace(/^mongodb(\+srv)?:/, "http:"));
if (!new Set(["127.0.0.1", "::1", "localhost"]).has(parsedMongoUri.hostname))
  throw new Error("Integration tests only accept a local TEST_MONGODB_URI.");
const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10_000 });
const database = client.db(databaseName);
let baseUrl = "";
let nextProcess;
let fixture;

const customerPayload = (overrides = {}) => ({
  address: "Address A",
  businessRegistration: "BR-001",
  companyName: "ABC Trading",
  contact: "David",
  email: "david@example.test",
  name: "ABC",
  notes: "",
  phone: "12345678",
  ...overrides,
});
const quotePayload = (customerId, overrides = {}) => ({
  customer: customerPayload(),
  customerId,
  issueDate: "2026-08-31",
  lines: [
    {
      description: "",
      discountAmount: 0,
      name: "Service",
      quantity: 1,
      unitPrice: 100,
    },
  ],
  notes: "",
  terms: "",
  validUntil: "2026-09-30",
  ...overrides,
});
function sessionHash(token) {
  return createHash("sha256").update(token).digest("hex");
}
async function availablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  await new Promise((done) => server.close(done));
  if (!address || typeof address === "string")
    throw new Error("Could not reserve a port.");
  return address.port;
}
async function waitFor(check, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((done) => setTimeout(done, 200));
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
    expiresAt: new Date(Date.now() + 3600_000),
    tokenHash: sessionHash(token),
    userId,
  });
  return token;
}

before(async () => {
  await client.connect();
  await database.dropDatabase();
  const now = new Date();
  const ownerAId = new ObjectId();
  const operatorAId = new ObjectId();
  const viewerAId = new ObjectId();
  const ownerBId = new ObjectId();
  const workspaceAId = new ObjectId();
  const workspaceBId = new ObjectId();
  await database.collection("users").insertMany([
    {
      _id: ownerAId,
      accountStatus: "active",
      createdAt: now,
      email: "owner-a@example.test",
      name: "Owner A",
      passwordHash: "unused",
    },
    {
      _id: operatorAId,
      accountStatus: "active",
      createdAt: now,
      email: "operator-a@example.test",
      name: "Operator A",
      passwordHash: "unused",
    },
    {
      _id: viewerAId,
      accountStatus: "active",
      createdAt: now,
      email: "viewer-a@example.test",
      name: "Viewer A",
      passwordHash: "unused",
    },
    {
      _id: ownerBId,
      accountStatus: "active",
      createdAt: now,
      email: "owner-b@example.test",
      name: "Owner B",
      passwordHash: "unused",
    },
  ]);
  await database.collection("organizations").insertMany([
    {
      _id: workspaceAId,
      createdAt: now,
      createdBy: ownerAId,
      currency: "HKD",
      name: "Workspace A",
      status: "active",
      timeZone: "Asia/Hong_Kong",
    },
    {
      _id: workspaceBId,
      createdAt: now,
      createdBy: ownerBId,
      currency: "HKD",
      name: "Workspace B",
      status: "active",
      timeZone: "Asia/Hong_Kong",
    },
  ]);
  await database.collection("memberships").insertMany([
    {
      createdAt: now,
      createdBy: ownerAId,
      organizationId: workspaceAId,
      role: "owner",
      status: "active",
      userId: ownerAId,
    },
    {
      createdAt: now,
      createdBy: ownerAId,
      organizationId: workspaceAId,
      role: "operator",
      status: "active",
      userId: operatorAId,
    },
    {
      createdAt: now,
      createdBy: ownerAId,
      organizationId: workspaceAId,
      role: "viewer",
      status: "active",
      userId: viewerAId,
    },
    {
      createdAt: now,
      createdBy: ownerBId,
      organizationId: workspaceBId,
      role: "owner",
      status: "active",
      userId: ownerBId,
    },
  ]);
  fixture = {
    operatorToken: await createSession(operatorAId),
    ownerToken: await createSession(ownerAId),
    ownerBToken: await createSession(ownerBId),
    viewerToken: await createSession(viewerAId),
    workspaceAId,
  };
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
      stdio: "ignore",
    },
  );
  if (
    !(await waitFor(async () => {
      try {
        return (await fetch(`${baseUrl}/api/auth/session`)).status === 200;
      } catch {
        return false;
      }
    }))
  )
    throw new Error("Next.js integration server did not start.");
});
after(async () => {
  if (nextProcess && !nextProcess.killed) {
    if (process.platform === "win32") {
      const taskkill = spawn(
        "taskkill",
        ["/PID", String(nextProcess.pid), "/T", "/F"],
        { stdio: "ignore" },
      );
      await Promise.race([
        once(taskkill, "exit"),
        new Promise((done) => setTimeout(done, 5_000)),
      ]);
    } else {
      nextProcess.kill("SIGTERM");
      await Promise.race([
        once(nextProcess, "exit"),
        new Promise((done) => setTimeout(done, 5_000)),
      ]);
    }
  }
  await database.dropDatabase();
  await client.close();
});

test(
  "Customer workspace sharing, tenant isolation, and viewer read-only access",
  { concurrency: false },
  async () => {
    const created = await request("/api/customers", {
      body: customerPayload(),
      method: "POST",
      token: fixture.ownerToken,
    });
    assert.equal(created.response.status, 201);
    const id = created.body.customer.id;
    const shared = await request("/api/customers", {
      token: fixture.operatorToken,
    });
    assert.equal(shared.response.status, 200);
    assert.ok(shared.body.customers.some((customer) => customer.id === id));
    assert.equal(
      (await request(`/api/customers/${id}`, { token: fixture.operatorToken }))
        .response.status,
      200,
    );
    assert.equal(
      (
        await request(`/api/customers/${id}`, {
          body: customerPayload({ address: "Operator update" }),
          method: "PUT",
          token: fixture.operatorToken,
        })
      ).response.status,
      200,
    );
    assert.equal(
      (await request(`/api/customers/${id}`, { token: fixture.ownerBToken }))
        .response.status,
      404,
    );
    assert.equal(
      (
        await request(`/api/customers/${id}`, {
          body: customerPayload(),
          method: "PUT",
          token: fixture.ownerBToken,
        })
      ).response.status,
      404,
    );
    assert.equal(
      (await request(`/api/customers/${id}`, { token: fixture.viewerToken }))
        .response.status,
      200,
    );
    assert.equal(
      (
        await request("/api/customers", {
          body: customerPayload({ name: "Viewer create" }),
          method: "POST",
          token: fixture.viewerToken,
        })
      ).response.status,
      403,
    );
    assert.equal(
      (
        await request(`/api/customers/${id}`, {
          body: customerPayload(),
          method: "PUT",
          token: fixture.viewerToken,
        })
      ).response.status,
      403,
    );
    assert.equal(
      (
        await request(`/api/customers/${id}`, {
          body: { status: "archived" },
          method: "PATCH",
          token: fixture.viewerToken,
        })
      ).response.status,
      403,
    );
  },
);

test(
  "Customer archive, reactivate, and safe search work at workspace scope",
  { concurrency: false },
  async () => {
    const created = await request("/api/customers", {
      body: customerPayload({ name: "Archive searchable" }),
      method: "POST",
      token: fixture.ownerToken,
    });
    const id = created.body.customer.id;
    assert.equal(
      (
        await request(`/api/customers/${id}`, {
          body: { status: "archived" },
          method: "PATCH",
          token: fixture.ownerToken,
        })
      ).response.status,
      200,
    );
    assert.equal(
      (
        await database
          .collection("customers")
          .findOne({ _id: new ObjectId(id) })
      )?.status,
      "archived",
    );
    assert.ok(
      !(
        await request("/api/customers", { token: fixture.ownerToken })
      ).body.customers.some((customer) => customer.id === id),
    );
    assert.ok(
      (
        await request("/api/customers?status=archived", {
          token: fixture.ownerToken,
        })
      ).body.customers.some((customer) => customer.id === id),
    );
    assert.equal(
      (
        await request(`/api/customers/${id}`, {
          body: { status: "active" },
          method: "PATCH",
          token: fixture.ownerToken,
        })
      ).response.status,
      200,
    );
    assert.ok(
      (
        await request("/api/customers", { token: fixture.ownerToken })
      ).body.customers.some((customer) => customer.id === id),
    );
    for (const term of ["ABC", "David", "david@", "12345678"])
      assert.ok(
        (
          await request(`/api/customers?q=${encodeURIComponent(term)}`, {
            token: fixture.ownerToken,
          })
        ).body.customers.some((customer) => customer.id === id),
      );
  },
);

test(
  "Archived customers are blocked for new quotes and quote snapshots remain stable on customer and quote edits",
  { concurrency: false },
  async () => {
    const created = await request("/api/customers", {
      body: customerPayload({
        address: "Address A",
        name: "Snapshot customer",
      }),
      method: "POST",
      token: fixture.ownerToken,
    });
    const id = created.body.customer.id;
    const quote = await request("/api/quotes", {
      body: quotePayload(id),
      method: "POST",
      token: fixture.ownerToken,
    });
    assert.equal(quote.response.status, 201);
    const quoteId = quote.body.quote.id;
    assert.equal(quote.body.quote.customerSnapshot.address, "Address A");
    assert.equal(
      (
        await request(`/api/customers/${id}`, {
          body: customerPayload({
            address: "Address B",
            name: "Snapshot customer",
          }),
          method: "PUT",
          token: fixture.ownerToken,
        })
      ).response.status,
      200,
    );
    const read = await request(`/api/quotes/${quoteId}`, {
      token: fixture.ownerToken,
    });
    assert.equal(read.body.quote.customerSnapshot.address, "Address A");
    const edit = await request(`/api/quotes/${quoteId}`, {
      body: quotePayload(id, { notes: "edited only" }),
      method: "PUT",
      token: fixture.ownerToken,
    });
    assert.equal(edit.response.status, 200);
    assert.equal(edit.body.quote.customerSnapshot.address, "Address A");
    assert.equal(
      (
        await request(`/api/customers/${id}`, {
          body: { status: "archived" },
          method: "PATCH",
          token: fixture.ownerToken,
        })
      ).response.status,
      200,
    );
    const blocked = await request("/api/quotes", {
      body: quotePayload(id),
      method: "POST",
      token: fixture.ownerToken,
    });
    assert.equal(blocked.response.status, 404);
    assert.equal(
      await database.collection("quotes").countDocuments({
        customerId: new ObjectId(id),
        quoteNumber: { $ne: quote.body.quote.quoteNumber },
      }),
      0,
    );
  },
);

test(
  "Customer detail returns only quotations linked by organizationId and customerId",
  { concurrency: false },
  async () => {
    const customerA = (
      await request("/api/customers", {
        body: customerPayload({ name: "Related A" }),
        method: "POST",
        token: fixture.ownerToken,
      })
    ).body.customer;
    const customerB = (
      await request("/api/customers", {
        body: customerPayload({ name: "Related B" }),
        method: "POST",
        token: fixture.ownerToken,
      })
    ).body.customer;
    const quoteA1 = await request("/api/quotes", {
      body: quotePayload(customerA.id),
      method: "POST",
      token: fixture.ownerToken,
    });
    const quoteA2 = await request("/api/quotes", {
      body: quotePayload(customerA.id, {
        issueDate: "2026-08-30",
        validUntil: "2026-09-29",
      }),
      method: "POST",
      token: fixture.ownerToken,
    });
    const quoteB = await request("/api/quotes", {
      body: quotePayload(customerB.id),
      method: "POST",
      token: fixture.ownerToken,
    });
    const detail = await request(`/api/customers/${customerA.id}`, {
      token: fixture.ownerToken,
    });
    assert.equal(detail.response.status, 200);
    assert.deepEqual(
      new Set(detail.body.quotations.map((quote) => quote.id)),
      new Set([quoteA1.body.quote.id, quoteA2.body.quote.id]),
    );
    assert.ok(
      !detail.body.quotations.some(
        (quote) => quote.id === quoteB.body.quote.id,
      ),
    );
  },
);

test(
  "Suspended workspace blocks every customer mutation",
  { concurrency: false },
  async () => {
    const customer = (
      await request("/api/customers", {
        body: customerPayload({ name: "Suspended" }),
        method: "POST",
        token: fixture.ownerToken,
      })
    ).body.customer;
    await database
      .collection("organizations")
      .updateOne(
        { _id: fixture.workspaceAId },
        { $set: { status: "suspended" } },
      );
    try {
      assert.equal(
        (
          await request("/api/customers", {
            body: customerPayload({ name: "No create" }),
            method: "POST",
            token: fixture.ownerToken,
          })
        ).response.status,
        403,
      );
      assert.equal(
        (
          await request(`/api/customers/${customer.id}`, {
            body: customerPayload({ name: "No update" }),
            method: "PUT",
            token: fixture.ownerToken,
          })
        ).response.status,
        403,
      );
      assert.equal(
        (
          await request(`/api/customers/${customer.id}`, {
            body: { status: "archived" },
            method: "PATCH",
            token: fixture.ownerToken,
          })
        ).response.status,
        403,
      );
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
