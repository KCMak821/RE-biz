/**
 * Organization-scoped workspace data.
 *
 * RE-Biz business data belongs to an organization, not to the member who
 * happened to create it. These tests pin that contract down from both sides:
 * every member of one workspace reads the same receipts, ledger totals, quotes,
 * invoices and items, while a second organization can never read, guess or
 * mutate any of it. `createdBy` survives as audit trail and must never narrow
 * what a colleague can see.
 *
 * Role permission is a separate axis and is asserted separately: a viewer reads
 * everything the company has and writes nothing.
 *
 * Test order matters in one place only — the dashboard cases run before any
 * receipt exists, so the company totals can be asserted as exact amounts.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

import { MongoClient, ObjectId } from "mongodb";

import { stopChildProcess } from "./child-process.mjs";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const mongoUri = process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27018";
const parsedMongoUri = new URL(mongoUri.replace(/^mongodb(\+srv)?:/, "http:"));
if (!new Set(["127.0.0.1", "::1", "localhost"]).has(parsedMongoUri.hostname))
  throw new Error("Integration tests only accept a local TEST_MONGODB_URI.");
const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10_000 });
const database = client.db(
  `receipt_issuer_workspace_scope_test_${process.pid}_${randomBytes(6).toString("hex")}`,
);

let baseUrl = "";
let server;
let fixture;
let databaseConnected = false;

const customerPayload = (overrides = {}) => ({
  address: "Shared Address",
  businessRegistration: "BR-SHARED",
  companyName: "Shared Trading",
  contact: "Winnie",
  email: "winnie@example.test",
  name: "Shared Customer",
  notes: "",
  phone: "12345678",
  ...overrides,
});
const receiptPayload = (overrides = {}) => ({
  amount: 1000,
  businessRegistration: "BR-SHARED",
  description: "Workspace receipt",
  issueDate: "2026-09-02",
  issuerAddress: "Issuer Address",
  issuerContact: "Issuer Contact",
  issuerName: "RE-Biz Test Co",
  notes: "",
  payerAddress: "Payer Address",
  payerName: "Payer",
  paymentMethod: "現金",
  ...overrides,
});
const quotePayload = (overrides = {}) => ({
  customer: customerPayload(),
  issueDate: "2026-08-31",
  lines: [
    { description: "", discountAmount: 0, name: "Quoted service", quantity: 1, unitPrice: 500 },
  ],
  notes: "",
  terms: "",
  validUntil: "2026-09-30",
  ...overrides,
});
const invoicePayload = (customerId, overrides = {}) => ({
  customerId,
  dueDate: "2026-09-30",
  issueDate: "2026-08-31",
  lines: [
    { description: "", discountAmount: 0, name: "Invoiced service", quantity: 1, unitPrice: 800 },
  ],
  notes: "",
  terms: "",
  ...overrides,
});
const itemPayload = (overrides = {}) => ({
  description: "",
  isActive: true,
  name: "Shared item",
  sku: "SKU-1",
  unitPrice: 250,
  ...overrides,
});

function sessionHash(token) {
  return createHash("sha256").update(token).digest("hex");
}
async function freePort() {
  const net = createServer();
  net.listen(0, "127.0.0.1");
  await once(net, "listening");
  const { port } = net.address();
  await new Promise((done) => net.close(done));
  return port;
}
async function waitFor(check) {
  const deadline = Date.now() + 60_000;
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
async function session(userId) {
  const token = randomBytes(32).toString("base64url");
  await database
    .collection("sessions")
    .insertOne({ expiresAt: new Date(Date.now() + 3600_000), tokenHash: sessionHash(token), userId });
  return token;
}
/** Receipt creation answers with numbers, so the id is read back from the list. */
async function receiptByNumber(receiptNumber, token) {
  const list = await request(`/api/receipts?q=${encodeURIComponent(receiptNumber)}`, { token });
  return list.body.receipts.find((receipt) => receipt.receiptNumber === receiptNumber);
}
async function acceptedQuote(token, overrides = {}) {
  const created = await request("/api/quotes", { body: quotePayload(overrides), method: "POST", token });
  assert.equal(created.response.status, 201);
  const { id } = created.body.quote;
  await request(`/api/quotes/${id}`, { body: { action: "status", status: "sent" }, method: "PUT", token });
  await request(`/api/quotes/${id}`, { body: { action: "status", status: "accepted" }, method: "PUT", token });
  return created.body.quote;
}

before(async () => {
  await client.connect();
  databaseConnected = true;
  await database.dropDatabase();

  const now = new Date();
  const owner = new ObjectId();
  const admin = new ObjectId();
  const operator = new ObjectId();
  const viewer = new ObjectId();
  const ownerB = new ObjectId();
  const workspaceA = new ObjectId();
  const workspaceB = new ObjectId();

  await database.collection("users").insertMany(
    [owner, admin, operator, viewer, ownerB].map((id, index) => ({
      _id: id,
      accountStatus: "active",
      createdAt: now,
      email: `scope-${index}@example.test`,
      name: `Member ${index}`,
      passwordHash: "unused",
      platformRole: "USER",
    })),
  );
  await database.collection("organizations").insertMany([
    {
      _id: workspaceA,
      address: "Company A Address",
      bankDetails: "Bank A",
      businessRegistration: "BR-A",
      createdAt: now,
      createdBy: owner,
      currency: "HKD",
      email: "a@example.test",
      name: "Workspace A",
      phone: "+852 1000 0000",
      status: "active",
      timeZone: "Asia/Hong_Kong",
    },
    {
      _id: workspaceB,
      createdAt: now,
      createdBy: ownerB,
      currency: "HKD",
      name: "Workspace B",
      status: "active",
      timeZone: "Asia/Hong_Kong",
    },
  ]);
  await database.collection("memberships").insertMany([
    { createdAt: now, createdBy: owner, organizationId: workspaceA, role: "owner", status: "active", userId: owner },
    { createdAt: now, createdBy: owner, organizationId: workspaceA, role: "admin", status: "active", userId: admin },
    { createdAt: now, createdBy: owner, organizationId: workspaceA, role: "operator", status: "active", userId: operator },
    { createdAt: now, createdBy: owner, organizationId: workspaceA, role: "viewer", status: "active", userId: viewer },
    { createdAt: now, createdBy: ownerB, organizationId: workspaceB, role: "owner", status: "active", userId: ownerB },
  ]);

  fixture = {
    admin: await session(admin),
    operator: await session(operator),
    owner: await session(owner),
    ownerB: await session(ownerB),
    viewer: await session(viewer),
    workspaceA,
    workspaceB,
  };
  fixture.members = [fixture.owner, fixture.admin, fixture.operator, fixture.viewer];

  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [
      resolve(root, "node_modules", "next", "dist", "bin", "next"),
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        MONGODB_DB: database.databaseName,
        MONGODB_URI: mongoUri,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: "ignore",
    },
  );
  assert.equal(
    await waitFor(async () => {
      try {
        return (await fetch(`${baseUrl}/api/auth/session`)).status === 200;
      } catch {
        return false;
      }
    }),
    true,
  );
});

after(async () => {
  let cleanupError;
  try {
    if (!(await stopChildProcess(server)))
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

/* ------------------------------------------------------------ cases 3 and 4
   Runs first, while the workspace still has no receipts, so the company totals
   can be asserted as exact amounts rather than as a delta. */
test(
  "Case 3 and 4: every role reads one company-wide income, expense and balance",
  { concurrency: false },
  async () => {
    assert.equal(
      (
        await request("/api/ledger", {
          body: { amount: 67_500, date: "2026-09-01", description: "Owner income", type: "IN" },
          method: "POST",
          token: fixture.owner,
        })
      ).response.status,
      201,
    );
    for (const token of fixture.members) {
      const ledger = await request("/api/ledger", { token });
      assert.equal(ledger.response.status, 200);
      assert.deepEqual(ledger.body.summary, { balance: 67_500, expense: 0, income: 67_500 });
    }

    assert.equal(
      (
        await request("/api/ledger", {
          body: { amount: 12_500, date: "2026-09-01", description: "Admin expense", type: "OUT" },
          method: "POST",
          token: fixture.admin,
        })
      ).response.status,
      201,
    );
    for (const token of fixture.members) {
      const ledger = await request("/api/ledger", { token });
      assert.deepEqual(ledger.body.summary, { balance: 55_000, expense: 12_500, income: 67_500 });
      // Both entries are visible to everyone, whoever recorded them.
      const descriptions = ledger.body.entries.map((entry) => entry.description);
      assert.ok(descriptions.includes("Owner income"));
      assert.ok(descriptions.includes("Admin expense"));
    }

    // A second organization shares none of it.
    const other = await request("/api/ledger", { token: fixture.ownerB });
    assert.equal(other.response.status, 200);
    assert.deepEqual(other.body.summary, { balance: 0, expense: 0, income: 0 });
    assert.equal(other.body.entries.length, 0);
  },
);

test(
  "Case 1: a receipt the owner creates is listed and readable by an operator",
  { concurrency: false },
  async () => {
    const created = await request("/api/receipts", {
      body: { receipts: [receiptPayload({ description: "Owner receipt", payerName: "Owner payer" })] },
      method: "POST",
      token: fixture.owner,
    });
    assert.equal(created.response.status, 201);
    const [receiptNumber] = created.body.receiptNumbers;

    const listed = await receiptByNumber(receiptNumber, fixture.operator);
    assert.ok(listed, "operator should see the owner's receipt in the list");
    const detail = await request(`/api/receipts/${listed.id}`, { token: fixture.operator });
    assert.equal(detail.response.status, 200);
    assert.equal(detail.body.receipt.receiptNumber, receiptNumber);
  },
);

test(
  "Case 2: a receipt the operator creates is readable by the owner",
  { concurrency: false },
  async () => {
    const created = await request("/api/receipts", {
      body: { receipts: [receiptPayload({ description: "Operator receipt", payerName: "Operator payer" })] },
      method: "POST",
      token: fixture.operator,
    });
    assert.equal(created.response.status, 201);
    const [receiptNumber] = created.body.receiptNumbers;

    const listed = await receiptByNumber(receiptNumber, fixture.owner);
    assert.ok(listed, "owner should see the operator's receipt in the list");
    assert.equal(
      (await request(`/api/receipts/${listed.id}`, { token: fixture.owner })).response.status,
      200,
    );
    // Admin and viewer read it too.
    for (const token of [fixture.admin, fixture.viewer]) {
      assert.equal((await request(`/api/receipts/${listed.id}`, { token })).response.status, 200);
    }
  },
);

test(
  "Case 5 and 6: quotes are company-wide in list, detail and status changes",
  { concurrency: false },
  async () => {
    const ownerQuote = (
      await request("/api/quotes", { body: quotePayload(), method: "POST", token: fixture.owner })
    ).body.quote;
    const operatorQuote = (
      await request("/api/quotes", { body: quotePayload(), method: "POST", token: fixture.operator })
    ).body.quote;

    for (const token of fixture.members) {
      const list = await request("/api/quotes", { token });
      assert.equal(list.response.status, 200);
      const ids = new Set(list.body.quotes.map((quote) => quote.id));
      assert.ok(ids.has(ownerQuote.id), "every member lists the owner's quote");
      assert.ok(ids.has(operatorQuote.id), "every member lists the operator's quote");
      // The detail route must agree with the list, or the row would 404 on click.
      assert.equal((await request(`/api/quotes/${ownerQuote.id}`, { token })).response.status, 200);
      assert.equal((await request(`/api/quotes/${operatorQuote.id}`, { token })).response.status, 200);
    }

    // Case 6: an admin acts on a quote the operator created.
    assert.equal(
      (
        await request(`/api/quotes/${operatorQuote.id}`, {
          body: { action: "status", status: "sent" },
          method: "PUT",
          token: fixture.admin,
        })
      ).response.status,
      200,
    );
    const reread = await request(`/api/quotes/${operatorQuote.id}`, { token: fixture.owner });
    assert.equal(reread.body.quote.storedStatus, "sent");
  },
);

test(
  "Case 7: an invoice the owner creates is readable and payable by an operator",
  { concurrency: false },
  async () => {
    const customer = (
      await request("/api/customers", { body: customerPayload(), method: "POST", token: fixture.owner })
    ).body.customer;
    const invoice = (
      await request("/api/invoices", {
        body: invoicePayload(customer.id),
        method: "POST",
        token: fixture.owner,
      })
    ).body.invoice;

    for (const token of fixture.members) {
      const list = await request("/api/invoices", { token });
      assert.ok(list.body.invoices.some((row) => row.id === invoice.id));
      assert.equal((await request(`/api/invoices/${invoice.id}`, { token })).response.status, 200);
    }

    // The operator drives the whole lifecycle of a colleague's invoice.
    assert.equal(
      (
        await request(`/api/invoices/${invoice.id}`, {
          body: { action: "send" },
          method: "PATCH",
          token: fixture.operator,
        })
      ).response.status,
      200,
    );
    const paid = await request(`/api/invoices/${invoice.id}/payments`, {
      body: { amount: 800, note: "", paidAt: "2026-09-02" },
      method: "POST",
      token: fixture.operator,
    });
    assert.equal(paid.response.status, 201);
    assert.equal(paid.body.invoice.paymentStatus, "paid");
  },
);

test(
  "Case 8: an item the operator creates is visible to every role",
  { concurrency: false },
  async () => {
    const created = await request("/api/items", {
      body: itemPayload({ name: "Operator item" }),
      method: "POST",
      token: fixture.operator,
    });
    assert.equal(created.response.status, 201);
    const itemId = created.body.item.id;

    for (const token of fixture.members) {
      const list = await request("/api/items", { token });
      assert.equal(list.response.status, 200);
      assert.ok(list.body.items.some((item) => item.id === itemId));
    }
    // The owner edits a colleague's item, then the admin removes it.
    assert.equal(
      (
        await request(`/api/items/${itemId}`, {
          body: itemPayload({ name: "Renamed by owner" }),
          method: "PUT",
          token: fixture.owner,
        })
      ).response.status,
      200,
    );
    assert.equal(
      (await request(`/api/items/${itemId}`, { method: "DELETE", token: fixture.admin })).response.status,
      200,
    );
  },
);

test(
  "Case 9: a viewer reads all company data and writes none of it",
  { concurrency: false },
  async () => {
    const customer = (
      await request("/api/customers", {
        body: customerPayload({ name: "Viewer read" }),
        method: "POST",
        token: fixture.owner,
      })
    ).body.customer;
    const item = (
      await request("/api/items", { body: itemPayload({ name: "Viewer item" }), method: "POST", token: fixture.owner })
    ).body.item;
    const quote = (
      await request("/api/quotes", { body: quotePayload(), method: "POST", token: fixture.owner })
    ).body.quote;
    const receiptNumbers = (
      await request("/api/receipts", {
        body: { receipts: [receiptPayload({ description: "Viewer receipt" })] },
        method: "POST",
        token: fixture.owner,
      })
    ).body.receiptNumbers;
    const receipt = await receiptByNumber(receiptNumbers[0], fixture.viewer);

    // Reads: everything the company holds.
    for (const path of ["/api/receipts", "/api/ledger", "/api/quotes", "/api/invoices", "/api/items", "/api/customers"]) {
      assert.equal((await request(path, { token: fixture.viewer })).response.status, 200, path);
    }
    assert.ok(receipt, "viewer sees the receipt in the list");
    assert.equal((await request(`/api/receipts/${receipt.id}`, { token: fixture.viewer })).response.status, 200);
    assert.equal((await request(`/api/quotes/${quote.id}`, { token: fixture.viewer })).response.status, 200);

    // Writes: refused on role, not on ownership, so the status is 403.
    const refusals = [
      ["/api/receipts", { receipts: [receiptPayload()] }, "POST"],
      ["/api/ledger", { amount: 10, date: "2026-09-01", description: "Nope", type: "IN" }, "POST"],
      ["/api/quotes", quotePayload(), "POST"],
      ["/api/items", itemPayload({ name: "Nope" }), "POST"],
      ["/api/customers", customerPayload({ name: "Nope" }), "POST"],
      [`/api/items/${item.id}`, itemPayload({ name: "Nope" }), "PUT"],
      [`/api/customers/${customer.id}`, customerPayload({ name: "Nope" }), "PUT"],
      [`/api/customers/${customer.id}`, { status: "archived" }, "PATCH"],
      [`/api/quotes/${quote.id}`, { action: "status", status: "sent" }, "PUT"],
      [`/api/receipts/${receipt.id}`, { paymentStatus: "paid" }, "PUT"],
    ];
    for (const [path, body, method] of refusals) {
      assert.equal(
        (await request(path, { body, method, token: fixture.viewer })).response.status,
        403,
        `${method} ${path}`,
      );
    }
    assert.equal(
      (await request(`/api/items/${item.id}`, { method: "DELETE", token: fixture.viewer })).response.status,
      403,
    );
  },
);

test(
  "Case 10: organization B can neither read nor mutate organization A, even with the ids",
  { concurrency: false },
  async () => {
    const customer = (
      await request("/api/customers", {
        body: customerPayload({ name: "Tenant A only" }),
        method: "POST",
        token: fixture.owner,
      })
    ).body.customer;
    const item = (
      await request("/api/items", { body: itemPayload({ name: "Tenant A item" }), method: "POST", token: fixture.owner })
    ).body.item;
    const quote = (
      await request("/api/quotes", { body: quotePayload(), method: "POST", token: fixture.owner })
    ).body.quote;
    const invoice = (
      await request("/api/invoices", { body: invoicePayload(customer.id), method: "POST", token: fixture.owner })
    ).body.invoice;
    const receiptNumbers = (
      await request("/api/receipts", {
        body: { receipts: [receiptPayload({ description: "Tenant A receipt" })] },
        method: "POST",
        token: fixture.owner,
      })
    ).body.receiptNumbers;
    const receipt = await receiptByNumber(receiptNumbers[0], fixture.owner);

    // Reads by id leak nothing.
    for (const path of [
      `/api/customers/${customer.id}`,
      `/api/quotes/${quote.id}`,
      `/api/invoices/${invoice.id}`,
      `/api/receipts/${receipt.id}`,
    ]) {
      assert.equal((await request(path, { token: fixture.ownerB })).response.status, 404, path);
    }
    // Lists hold none of A's rows.
    for (const [path, key] of [
      ["/api/receipts", "receipts"],
      ["/api/quotes", "quotes"],
      ["/api/invoices", "invoices"],
      ["/api/items", "items"],
      ["/api/customers", "customers"],
    ]) {
      const list = await request(path, { token: fixture.ownerB });
      assert.equal(list.response.status, 200, path);
      assert.equal(list.body[key].length, 0, path);
    }
    // Writes by id are refused rather than silently applied.
    const mutations = [
      [`/api/items/${item.id}`, itemPayload({ name: "Stolen" }), "PUT"],
      [`/api/customers/${customer.id}`, { status: "archived" }, "PATCH"],
      [`/api/quotes/${quote.id}`, { action: "status", status: "sent" }, "PUT"],
      [`/api/invoices/${invoice.id}`, { action: "void" }, "PATCH"],
      [`/api/receipts/${receipt.id}`, { paymentStatus: "paid" }, "PUT"],
    ];
    for (const [path, body, method] of mutations) {
      assert.equal(
        (await request(path, { body, method, token: fixture.ownerB })).response.status,
        404,
        `${method} ${path}`,
      );
    }
    assert.equal(
      (await request(`/api/items/${item.id}`, { method: "DELETE", token: fixture.ownerB })).response.status,
      404,
    );
    assert.equal(
      (await request(`/api/quotes/${quote.id}/duplicate`, { method: "POST", token: fixture.ownerB })).response.status,
      404,
    );
    assert.equal(
      (await request(`/api/quotes/${quote.id}/invoice`, { method: "POST", token: fixture.ownerB })).response.status,
      404,
    );
    assert.equal(
      (await request(`/api/quotes/${quote.id}/receipt`, { method: "POST", token: fixture.ownerB })).response.status,
      404,
    );
    // Nothing above changed A's data.
    assert.equal((await request(`/api/quotes/${quote.id}`, { token: fixture.owner })).body.quote.storedStatus, "draft");
  },
);

test(
  "Case 11: quote numbers run as one organization-wide sequence",
  { concurrency: false },
  async () => {
    // A month of its own, so the sequence starts from a known point regardless
    // of the quotes the other cases created.
    const month = { issueDate: "2026-12-01", validUntil: "2026-12-31" };
    const numbers = [];
    for (const token of [fixture.owner, fixture.operator, fixture.admin]) {
      const created = await request("/api/quotes", { body: quotePayload(month), method: "POST", token });
      assert.equal(created.response.status, 201);
      numbers.push(created.body.quote.quoteNumber);
    }
    assert.deepEqual(numbers, ["QUO-202612-0001", "QUO-202612-0002", "QUO-202612-0003"]);

    // The counter is keyed by organization, and the numbers are unique company-wide.
    const counter = await database
      .collection("quoteCounters")
      .findOne({ monthKey: "202612", organizationId: fixture.workspaceA });
    assert.equal(counter.sequence, 3);
    assert.equal(counter.userId, undefined);

    // Organization B starts its own sequence at 1 for the same month.
    const otherWorkspace = await request("/api/quotes", {
      body: quotePayload(month),
      method: "POST",
      token: fixture.ownerB,
    });
    assert.equal(otherWorkspace.body.quote.quoteNumber, "QUO-202612-0001");
  },
);

test(
  "Case 12: an operator converts a quote the owner created into an invoice",
  { concurrency: false },
  async () => {
    const quote = await acceptedQuote(fixture.owner);
    const converted = await request(`/api/quotes/${quote.id}/invoice`, {
      method: "POST",
      token: fixture.operator,
    });
    assert.equal(converted.response.status, 201);

    // The invoice is readable by the whole workspace and linked back on the quote.
    for (const token of fixture.members) {
      assert.equal(
        (await request(`/api/invoices/${converted.body.invoice.id}`, { token })).response.status,
        200,
      );
    }
    const detail = await request(`/api/quotes/${quote.id}`, { token: fixture.admin });
    assert.equal(detail.body.invoice.id, converted.body.invoice.id);
  },
);

test(
  "Case 13: an admin converts a quote the owner created into a receipt draft",
  { concurrency: false },
  async () => {
    const quote = await acceptedQuote(fixture.owner);
    const converted = await request(`/api/quotes/${quote.id}/receipt`, {
      method: "POST",
      token: fixture.admin,
    });
    assert.equal(converted.response.status, 201);
    assert.equal(converted.body.receipt.paymentStatus, "pending");

    // The draft is visible workspace-wide, and the operator confirms the money.
    for (const token of fixture.members) {
      assert.equal(
        (await request(`/api/receipts/${converted.body.receipt.id}`, { token })).response.status,
        200,
      );
    }
    const detail = await request(`/api/quotes/${quote.id}`, { token: fixture.operator });
    assert.equal(detail.body.receipt.id, converted.body.receipt.id);
    assert.equal(
      (
        await request(`/api/receipts/${converted.body.receipt.id}`, {
          body: { paymentStatus: "paid" },
          method: "PUT",
          token: fixture.operator,
        })
      ).response.status,
      200,
    );
    // Confirmed money reaches the shared ledger, identically for every member.
    const summaries = [];
    for (const token of fixture.members) {
      summaries.push((await request("/api/ledger", { token })).body.summary);
    }
    for (const summary of summaries) assert.deepEqual(summary, summaries[0]);
    assert.ok(summaries[0].income > 67_500);
  },
);
