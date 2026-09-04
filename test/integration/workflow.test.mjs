/**
 * The whole operating loop, end to end: Customer → Quote → Invoice → Payment →
 * Receipt → Ledger.
 *
 * The point of this file is the accounting guarantee. RE-Biz recognises income
 * at the receipt and nowhere else, so one HKD 10,000 trade must show as exactly
 * HKD 10,000 of income no matter how many documents it passed through. Every
 * other assertion here exists to protect that: one invoice per quote, one
 * receipt per invoice, no overpayment, and no second route to a second receipt.
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
const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10_000 });
const database = client.db(`receipt_issuer_workflow_test_${process.pid}_${randomBytes(6).toString("hex")}`);

let baseUrl = "";
let server;
let fixture;
let databaseConnected = false;

/* ------------------------------------------------------------------ helpers */

const customerPayload = (overrides = {}) => ({
  address: "香港中環 1 號",
  businessRegistration: "BR-999",
  companyName: "Workflow Customer Ltd",
  contact: "陳先生",
  email: "flow@example.test",
  name: "Workflow Customer",
  notes: "",
  phone: "12345678",
  ...overrides,
});

const quotePayload = (customerId, overrides = {}) => ({
  customer: customerPayload(),
  customerId,
  issueDate: "2026-08-01",
  lines: [{ description: "", discountAmount: 0, name: "顧問服務", quantity: 1, unitPrice: 10_000 }],
  notes: "報價備註",
  terms: "30 天內付款",
  validUntil: "2036-08-31",
  ...overrides,
});

const invoicePayload = (customerId, overrides = {}) => ({
  customerId,
  dueDate: "2036-09-30",
  issueDate: "2026-08-01",
  lines: [{ description: "", discountAmount: 0, name: "顧問服務", quantity: 1, unitPrice: 10_000 }],
  notes: "",
  terms: "",
  ...overrides,
});

function hash(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function port() {
  const net = createServer();
  net.listen(0, "127.0.0.1");
  await once(net, "listening");
  const { port: chosen } = net.address();
  await new Promise((done) => net.close(done));
  return chosen;
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
    .insertOne({ expiresAt: new Date(Date.now() + 3600_000), tokenHash: hash(token), userId });
  return token;
}

/** A customer and a fresh draft quote — the starting point of most cases below. */
async function newQuote(token = fixture.owner, overrides = {}) {
  const customer = (await request("/api/customers", { body: customerPayload(), method: "POST", token })).body.customer;
  const created = await request("/api/quotes", { body: quotePayload(customer.id, overrides), method: "POST", token });
  assert.equal(created.response.status, 201);
  return { customer, quote: created.body.quote };
}

async function setQuoteStatus(id, status, token = fixture.owner) {
  return request(`/api/quotes/${id}`, { body: { action: "status", status }, method: "PUT", token });
}

/** Drives a fresh quote to accepted, where both downstream routes begin. */
async function acceptedQuote(token = fixture.owner) {
  const { customer, quote } = await newQuote(token);
  assert.equal((await setQuoteStatus(quote.id, "sent", token)).response.status, 200);
  assert.equal((await setQuoteStatus(quote.id, "accepted", token)).response.status, 200);
  return { customer, quote };
}

/** A sent invoice for `amount`, ready to be collected against. */
async function sentInvoice(amount, token = fixture.owner) {
  const customer = (await request("/api/customers", { body: customerPayload(), method: "POST", token })).body.customer;
  const created = await request("/api/invoices", {
    body: invoicePayload(customer.id, {
      lines: [{ description: "", discountAmount: 0, name: "顧問服務", quantity: 1, unitPrice: amount }],
    }),
    method: "POST",
    token,
  });
  assert.equal(created.response.status, 201);
  const sent = await request(`/api/invoices/${created.body.invoice.id}`, {
    body: { action: "send" },
    method: "PATCH",
    token,
  });
  assert.equal(sent.response.status, 200);
  return sent.body.invoice;
}

/** Total income the workspace reports — the same number the dashboard shows. */
async function ledgerIncome(token = fixture.owner) {
  const ledger = await request("/api/ledger", { token });
  assert.equal(ledger.response.status, 200);
  return ledger.body.summary.income;
}

/* -------------------------------------------------------------------- setup */

before(async () => {
  await client.connect();
  databaseConnected = true;
  await database.dropDatabase();

  const now = new Date();
  const owner = new ObjectId();
  const admin = new ObjectId();
  const operator = new ObjectId();
  const viewer = new ObjectId();
  const outsider = new ObjectId();
  const workspace = new ObjectId();
  const otherWorkspace = new ObjectId();

  await database.collection("users").insertMany(
    [owner, admin, operator, viewer, outsider].map((id, index) => ({
      _id: id,
      accountStatus: "active",
      createdAt: now,
      email: `workflow-${index}@example.test`,
      name: `Workflow User ${index}`,
      passwordHash: "unused",
    })),
  );
  await database.collection("organizations").insertMany([
    {
      _id: workspace,
      address: "香港九龍 1 號",
      bankDetails: "HSBC 004",
      businessRegistration: "88888888",
      createdAt: now,
      createdBy: owner,
      currency: "HKD",
      email: "flow@rebiz.test",
      name: "Workflow 工作區",
      phone: "+852 1234 5678",
      status: "active",
      timeZone: "Asia/Hong_Kong",
    },
    {
      _id: otherWorkspace,
      createdAt: now,
      createdBy: outsider,
      currency: "HKD",
      name: "另一間公司",
      status: "active",
      timeZone: "Asia/Hong_Kong",
    },
  ]);
  await database.collection("memberships").insertMany([
    { createdAt: now, createdBy: owner, organizationId: workspace, role: "owner", status: "active", userId: owner },
    { createdAt: now, createdBy: owner, organizationId: workspace, role: "admin", status: "active", userId: admin },
    { createdAt: now, createdBy: owner, organizationId: workspace, role: "operator", status: "active", userId: operator },
    { createdAt: now, createdBy: owner, organizationId: workspace, role: "viewer", status: "active", userId: viewer },
    {
      createdAt: now,
      createdBy: outsider,
      organizationId: otherWorkspace,
      role: "owner",
      status: "active",
      userId: outsider,
    },
  ]);

  fixture = {
    admin: await session(admin),
    operator: await session(operator),
    outsider: await session(outsider),
    owner: await session(owner),
    viewer: await session(viewer),
    workspace,
  };

  const available = await port();
  baseUrl = `http://127.0.0.1:${available}`;
  server = spawn(
    process.execPath,
    [
      resolve(root, "node_modules", "next", "dist", "bin", "next"),
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(available),
    ],
    {
      cwd: root,
      env: { ...process.env, MONGODB_DB: database.databaseName, MONGODB_URI: mongoUri, NEXT_TELEMETRY_DISABLED: "1" },
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
    if (!(await stopChildProcess(server))) cleanupError = new Error("Next.js integration server did not stop.");
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

/* --------------------------------------------------------- quote lifecycle */

test("a quote only moves draft → sent → accepted / rejected", { concurrency: false }, async () => {
  const { quote } = await newQuote();
  assert.equal(quote.status, "draft");

  // Skipping a step is refused rather than quietly accepted.
  assert.equal((await setQuoteStatus(quote.id, "accepted")).response.status, 409);
  assert.equal((await setQuoteStatus(quote.id, "sent")).response.status, 200);
  assert.equal((await setQuoteStatus(quote.id, "accepted")).response.status, 200);
  // Nothing comes back out of a decided quote.
  assert.equal((await setQuoteStatus(quote.id, "sent")).response.status, 409);
  assert.equal((await setQuoteStatus(quote.id, "rejected")).response.status, 409);

  const rejected = (await newQuote()).quote;
  await setQuoteStatus(rejected.id, "sent");
  assert.equal((await setQuoteStatus(rejected.id, "rejected")).response.status, 200);
  assert.equal((await setQuoteStatus(rejected.id, "accepted")).response.status, 409);
});

test("expiry belongs to sent quotes only", { concurrency: false }, async () => {
  const { quote } = await newQuote();
  await setQuoteStatus(quote.id, "sent");
  await database
    .collection("quotes")
    .updateOne({ _id: new ObjectId(quote.id) }, { $set: { validUntil: "2020-01-01" } });

  const expired = await request(`/api/quotes/${quote.id}`, { token: fixture.owner });
  assert.equal(expired.body.quote.status, "expired");
  assert.equal((await setQuoteStatus(quote.id, "accepted")).response.status, 409);

  // An accepted quote is a decision, so the calendar must not undo it: it stays
  // accepted and convertible however long the paperwork takes.
  const { quote: accepted } = await acceptedQuote();
  await database
    .collection("quotes")
    .updateOne({ _id: new ObjectId(accepted.id) }, { $set: { validUntil: "2020-01-01" } });
  const stale = await request(`/api/quotes/${accepted.id}`, { token: fixture.owner });
  assert.equal(stale.body.quote.status, "accepted");
  assert.equal(
    (await request(`/api/quotes/${accepted.id}/invoice`, { method: "POST", token: fixture.owner })).response.status,
    201,
  );

  // The list filters agree with the detail view.
  const expiredList = await request("/api/quotes?status=expired", { token: fixture.owner });
  assert.ok(expiredList.body.quotes.some((row) => row.id === quote.id));
  assert.ok(!expiredList.body.quotes.some((row) => row.id === accepted.id));
  const acceptedList = await request("/api/quotes?status=accepted", { token: fixture.owner });
  assert.ok(acceptedList.body.quotes.some((row) => row.id === accepted.id));
});

/* ----------------------------------------------------------- quote → invoice */

test("only an accepted quote becomes an invoice, and only once", { concurrency: false }, async () => {
  const draft = (await newQuote()).quote;
  assert.equal(
    (await request(`/api/quotes/${draft.id}/invoice`, { method: "POST", token: fixture.owner })).response.status,
    409,
  );

  const rejected = (await newQuote()).quote;
  await setQuoteStatus(rejected.id, "sent");
  await setQuoteStatus(rejected.id, "rejected");
  assert.equal(
    (await request(`/api/quotes/${rejected.id}/invoice`, { method: "POST", token: fixture.owner })).response.status,
    409,
  );

  const lapsed = (await newQuote()).quote;
  await setQuoteStatus(lapsed.id, "sent");
  await database.collection("quotes").updateOne({ _id: new ObjectId(lapsed.id) }, { $set: { validUntil: "2020-01-01" } });
  assert.equal(
    (await request(`/api/quotes/${lapsed.id}/invoice`, { method: "POST", token: fixture.owner })).response.status,
    409,
  );

  const { quote } = await acceptedQuote();
  const converted = await request(`/api/quotes/${quote.id}/invoice`, { method: "POST", token: fixture.owner });
  assert.equal(converted.response.status, 201);

  // Nothing was retyped: the invoice carries the quote's snapshots and totals.
  const invoice = (await request(`/api/invoices/${converted.body.invoice.id}`, { token: fixture.owner })).body.invoice;
  assert.equal(invoice.totalAmount, 10_000);
  assert.equal(invoice.customerSnapshot.name, "Workflow Customer");
  assert.equal(invoice.companySnapshot.name, "Workflow 工作區");
  assert.equal(invoice.sourceQuoteId, quote.id);
  assert.equal(invoice.sourceQuoteNumber, quote.quoteNumber);
  assert.equal(invoice.lines.length, 1);
  assert.equal(invoice.status, "draft");
  assert.equal(invoice.paymentStatus, "unpaid");

  const again = await request(`/api/quotes/${quote.id}/invoice`, { method: "POST", token: fixture.owner });
  assert.equal(again.response.status, 409);
  assert.match(again.body.message, /已經建立請款單/);
  assert.equal(await database.collection("invoices").countDocuments({ sourceQuoteId: new ObjectId(quote.id) }), 1);
});

test("two simultaneous conversions still produce one invoice", { concurrency: false }, async () => {
  const { quote } = await acceptedQuote();
  const [first, second] = await Promise.all([
    request(`/api/quotes/${quote.id}/invoice`, { method: "POST", token: fixture.owner }),
    request(`/api/quotes/${quote.id}/invoice`, { method: "POST", token: fixture.operator }),
  ]);
  assert.deepEqual([first.response.status, second.response.status].sort(), [201, 409]);
  assert.equal(await database.collection("invoices").countDocuments({ sourceQuoteId: new ObjectId(quote.id) }), 1);
});

test("any colleague may carry a quote forward; another workspace may not", { concurrency: false }, async () => {
  // Owner writes it, operator accepts it, admin bills it — createdBy is audit
  // trail, not a lock.
  const { quote } = await newQuote(fixture.owner);
  assert.equal((await setQuoteStatus(quote.id, "sent", fixture.owner)).response.status, 200);
  assert.equal((await setQuoteStatus(quote.id, "accepted", fixture.operator)).response.status, 200);
  const converted = await request(`/api/quotes/${quote.id}/invoice`, { method: "POST", token: fixture.admin });
  assert.equal(converted.response.status, 201);

  // The viewer sees everything and changes nothing.
  assert.equal((await request(`/api/quotes/${quote.id}`, { token: fixture.viewer })).response.status, 200);
  assert.equal((await setQuoteStatus(quote.id, "rejected", fixture.viewer)).response.status, 403);
  assert.equal(
    (await request(`/api/quotes/${quote.id}/invoice`, { method: "POST", token: fixture.viewer })).response.status,
    403,
  );

  // Knowing the id is not access.
  assert.equal((await request(`/api/quotes/${quote.id}`, { token: fixture.outsider })).response.status, 404);
  assert.equal((await setQuoteStatus(quote.id, "rejected", fixture.outsider)).response.status, 404);
  assert.equal(
    (await request(`/api/quotes/${quote.id}/invoice`, { method: "POST", token: fixture.outsider })).response.status,
    404,
  );
  assert.equal(
    (await request(`/api/invoices/${converted.body.invoice.id}`, { token: fixture.outsider })).response.status,
    404,
  );
});

/* ------------------------------------------------------------------ payments */

test("payments accumulate, derive the status, and cannot exceed the invoice", { concurrency: false }, async () => {
  const customer = (await request("/api/customers", { body: customerPayload(), method: "POST", token: fixture.owner }))
    .body.customer;
  const draft = (await request("/api/invoices", { body: invoicePayload(customer.id), method: "POST", token: fixture.owner }))
    .body.invoice;
  assert.equal(draft.effectiveStatus, "draft");
  // Nothing can be collected against a document the customer has not seen.
  const onDraft = await request(`/api/invoices/${draft.id}/payments`, {
    body: { amount: 100, note: "", paidAt: "2026-09-01" },
    method: "POST",
    token: fixture.owner,
  });
  assert.equal(onDraft.response.status, 409);

  const invoice = await sentInvoice(10_000);
  assert.equal(invoice.effectiveStatus, "unpaid");
  assert.equal(invoice.outstandingAmount, 10_000);

  const first = await request(`/api/invoices/${invoice.id}/payments`, {
    body: { amount: 3_000, note: "訂金", paidAt: "2026-09-01" },
    method: "POST",
    token: fixture.owner,
  });
  assert.equal(first.response.status, 201);
  assert.equal(first.body.invoice.paidAmount, 3_000);
  assert.equal(first.body.invoice.outstandingAmount, 7_000);
  assert.equal(first.body.invoice.effectiveStatus, "partially_paid");
  // The instalment records who booked it and when.
  assert.equal(first.body.invoice.payments[0].createdByName, "Workflow User 0");
  assert.ok(first.body.invoice.payments[0].createdAt);

  const tooMuch = await request(`/api/invoices/${invoice.id}/payments`, {
    body: { amount: 8_000, note: "", paidAt: "2026-09-02" },
    method: "POST",
    token: fixture.owner,
  });
  assert.equal(tooMuch.response.status, 409);
  assert.match(tooMuch.body.message, /不可高於尚欠金額 HKD 7,000\.00/);

  // A colleague settles the balance.
  const second = await request(`/api/invoices/${invoice.id}/payments`, {
    body: { amount: 7_000, note: "尾款", paidAt: "2026-09-03" },
    method: "POST",
    token: fixture.operator,
  });
  assert.equal(second.response.status, 201);
  assert.equal(second.body.invoice.paidAmount, 10_000);
  assert.equal(second.body.invoice.outstandingAmount, 0);
  assert.equal(second.body.invoice.effectiveStatus, "paid");
  assert.equal(second.body.invoice.payments.length, 2);
  assert.equal(
    second.body.invoice.payments.find((payment) => payment.amount === 7_000).createdByName,
    "Workflow User 2",
  );

  const settled = await request(`/api/invoices/${invoice.id}/payments`, {
    body: { amount: 1, note: "", paidAt: "2026-09-04" },
    method: "POST",
    token: fixture.owner,
  });
  assert.equal(settled.response.status, 409);
  assert.match(settled.body.message, /已付款的請款單不能再登記收款/);
});

test("concurrent instalments cannot together overpay an invoice", { concurrency: false }, async () => {
  const invoice = await sentInvoice(10_000);
  // Each of these fits on its own; together they would collect 14,000 against a
  // 10,000 invoice, so exactly one has to lose.
  const results = await Promise.all([
    request(`/api/invoices/${invoice.id}/payments`, {
      body: { amount: 7_000, note: "A", paidAt: "2026-09-01" },
      method: "POST",
      token: fixture.owner,
    }),
    request(`/api/invoices/${invoice.id}/payments`, {
      body: { amount: 7_000, note: "B", paidAt: "2026-09-01" },
      method: "POST",
      token: fixture.operator,
    }),
  ]);
  assert.deepEqual(results.map((result) => result.response.status).sort(), [201, 409]);

  const settled = (await request(`/api/invoices/${invoice.id}`, { token: fixture.owner })).body.invoice;
  assert.equal(settled.paidAmount, 7_000);
  assert.equal(settled.payments.length, 1);
});

test("payment permissions and tenant boundary", { concurrency: false }, async () => {
  const invoice = await sentInvoice(500);
  const body = { amount: 100, note: "", paidAt: "2026-09-01" };
  assert.equal(
    (await request(`/api/invoices/${invoice.id}/payments`, { body, method: "POST", token: fixture.viewer })).response
      .status,
    403,
  );
  assert.equal(
    (await request(`/api/invoices/${invoice.id}/payments`, { body, method: "POST", token: fixture.outsider })).response
      .status,
    404,
  );
  assert.equal((await request(`/api/invoices/${invoice.id}`, { token: fixture.viewer })).body.invoice.paidAmount, 0);
});

test("a void invoice is read-only, and a collected one cannot be voided", { concurrency: false }, async () => {
  const invoice = await sentInvoice(1_000);
  assert.equal(
    (await request(`/api/invoices/${invoice.id}`, { body: { action: "void" }, method: "PATCH", token: fixture.owner }))
      .response.status,
    200,
  );
  assert.equal((await request(`/api/invoices/${invoice.id}`, { token: fixture.owner })).body.invoice.effectiveStatus, "void");
  assert.equal(
    (
      await request(`/api/invoices/${invoice.id}/payments`, {
        body: { amount: 10, note: "", paidAt: "2026-09-01" },
        method: "POST",
        token: fixture.owner,
      })
    ).response.status,
    409,
  );
  assert.equal(
    (await request(`/api/invoices/${invoice.id}/receipt`, { method: "POST", token: fixture.owner })).response.status,
    409,
  );

  const collected = await sentInvoice(1_000);
  await request(`/api/invoices/${collected.id}/payments`, {
    body: { amount: 400, note: "", paidAt: "2026-09-01" },
    method: "POST",
    token: fixture.owner,
  });
  const refused = await request(`/api/invoices/${collected.id}`, {
    body: { action: "void" },
    method: "PATCH",
    token: fixture.owner,
  });
  assert.equal(refused.response.status, 409);
  assert.match(refused.body.message, /已登記收款/);
});

test("overdue is derived from the due date, never stored", { concurrency: false }, async () => {
  const invoice = await sentInvoice(2_000);
  assert.equal(invoice.effectiveStatus, "unpaid");
  await database.collection("invoices").updateOne({ _id: new ObjectId(invoice.id) }, { $set: { dueDate: "2020-01-01" } });
  assert.equal((await request(`/api/invoices/${invoice.id}`, { token: fixture.owner })).body.invoice.effectiveStatus, "overdue");
  const stored = await database.collection("invoices").findOne({ _id: new ObjectId(invoice.id) });
  assert.equal(stored.status, "sent", "overdue is a reading of the data, not a state written into it");

  // Collecting on an overdue invoice is ordinary business, not an error.
  assert.equal(
    (
      await request(`/api/invoices/${invoice.id}/payments`, {
        body: { amount: 2_000, note: "", paidAt: "2026-09-01" },
        method: "POST",
        token: fixture.owner,
      })
    ).response.status,
    201,
  );
  assert.equal((await request(`/api/invoices/${invoice.id}`, { token: fixture.owner })).body.invoice.effectiveStatus, "paid");
});

/* --------------------------------------------------------- invoice → receipt */

test("a receipt is issued once, only from a fully paid invoice", { concurrency: false }, async () => {
  const invoice = await sentInvoice(10_000);
  const unpaid = await request(`/api/invoices/${invoice.id}/receipt`, { method: "POST", token: fixture.owner });
  assert.equal(unpaid.response.status, 409);
  assert.match(unpaid.body.message, /尚未收款/);

  await request(`/api/invoices/${invoice.id}/payments`, {
    body: { amount: 4_000, note: "轉帳", paidAt: "2026-09-01" },
    method: "POST",
    token: fixture.owner,
  });
  const partial = await request(`/api/invoices/${invoice.id}/receipt`, { method: "POST", token: fixture.owner });
  assert.equal(partial.response.status, 409);
  assert.match(partial.body.message, /部分款項/);

  await request(`/api/invoices/${invoice.id}/payments`, {
    body: { amount: 6_000, note: "轉帳", paidAt: "2026-09-05" },
    method: "POST",
    token: fixture.operator,
  });

  // The viewer may look but not issue; another workspace cannot even see it.
  assert.equal(
    (await request(`/api/invoices/${invoice.id}/receipt`, { method: "POST", token: fixture.viewer })).response.status,
    403,
  );
  assert.equal(
    (await request(`/api/invoices/${invoice.id}/receipt`, { method: "POST", token: fixture.outsider })).response.status,
    404,
  );

  // A colleague issues it, not necessarily whoever created the invoice.
  const issued = await request(`/api/invoices/${invoice.id}/receipt`, { method: "POST", token: fixture.admin });
  assert.equal(issued.response.status, 201);
  assert.equal(issued.body.receipt.paymentStatus, "paid");

  const receipt = (await request(`/api/receipts/${issued.body.receipt.id}`, { token: fixture.owner })).body.receipt;
  assert.equal(receipt.amount, 10_000);
  assert.equal(receipt.sourceInvoiceId, invoice.id);
  assert.equal(receipt.sourceInvoiceNumber, invoice.invoiceNumber);
  assert.equal(receipt.paymentStatus, "paid");
  assert.equal(receipt.payerName, "Workflow Customer Ltd");
  // Dated when the money finished arriving, not when the button was pressed.
  assert.equal(receipt.issueDate, "2026-09-05");

  // The invoice now points back at it, so the page offers "open" not "create".
  const linked = await request(`/api/invoices/${invoice.id}`, { token: fixture.owner });
  assert.equal(linked.body.receipt.receiptNumber, issued.body.receipt.receiptNumber);

  const again = await request(`/api/invoices/${invoice.id}/receipt`, { method: "POST", token: fixture.owner });
  assert.equal(again.response.status, 409);
  assert.match(again.body.message, /已開立收據/);
  assert.equal(await database.collection("receipts").countDocuments({ sourceInvoiceId: new ObjectId(invoice.id) }), 1);
});

test("two simultaneous receipt requests still produce one receipt", { concurrency: false }, async () => {
  const invoice = await sentInvoice(5_000);
  await request(`/api/invoices/${invoice.id}/payments`, {
    body: { amount: 5_000, note: "", paidAt: "2026-09-01" },
    method: "POST",
    token: fixture.owner,
  });
  const [first, second] = await Promise.all([
    request(`/api/invoices/${invoice.id}/receipt`, { method: "POST", token: fixture.owner }),
    request(`/api/invoices/${invoice.id}/receipt`, { method: "POST", token: fixture.operator }),
  ]);
  assert.deepEqual([first.response.status, second.response.status].sort(), [201, 409]);
  assert.equal(await database.collection("receipts").countDocuments({ sourceInvoiceId: new ObjectId(invoice.id) }), 1);
});

/* ----------------------------------------------------------- quote → receipt */

test("the two routes out of an accepted quote are mutually exclusive", { concurrency: false }, async () => {
  // Scenario A: paid on the spot, no invoice in between.
  const direct = await acceptedQuote();
  const receipt = await request(`/api/quotes/${direct.quote.id}/receipt`, { method: "POST", token: fixture.operator });
  assert.equal(receipt.response.status, 201);
  assert.equal(receipt.body.receipt.paymentStatus, "pending");
  const blockedInvoice = await request(`/api/quotes/${direct.quote.id}/invoice`, { method: "POST", token: fixture.owner });
  assert.equal(blockedInvoice.response.status, 409);
  assert.match(blockedInvoice.body.message, /已直接建立收據/);

  // Scenario B: billed first — the direct receipt route closes.
  const billed = await acceptedQuote();
  assert.equal(
    (await request(`/api/quotes/${billed.quote.id}/invoice`, { method: "POST", token: fixture.owner })).response.status,
    201,
  );
  const blockedReceipt = await request(`/api/quotes/${billed.quote.id}/receipt`, { method: "POST", token: fixture.owner });
  assert.equal(blockedReceipt.response.status, 409);
  assert.match(blockedReceipt.body.message, /已建立請款單/);

  // The quote names whichever downstream document exists, and only that one.
  const links = await request(`/api/quotes/${direct.quote.id}`, { token: fixture.owner });
  assert.equal(links.body.receipt.receiptNumber, receipt.body.receipt.receiptNumber);
  assert.equal(links.body.invoice, null);
});

test("a quote receipted through its invoice cannot also be receipted directly", { concurrency: false }, async () => {
  const { quote } = await acceptedQuote();
  const invoice = (await request(`/api/quotes/${quote.id}/invoice`, { method: "POST", token: fixture.owner })).body.invoice;
  await request(`/api/invoices/${invoice.id}`, { body: { action: "send" }, method: "PATCH", token: fixture.owner });
  await request(`/api/invoices/${invoice.id}/payments`, {
    body: { amount: 10_000, note: "", paidAt: "2026-09-01" },
    method: "POST",
    token: fixture.owner,
  });
  const issued = await request(`/api/invoices/${invoice.id}/receipt`, { method: "POST", token: fixture.owner });
  assert.equal(issued.response.status, 201);

  // The receipt carries both source references, so the quote is closed off too.
  const receipt = (await request(`/api/receipts/${issued.body.receipt.id}`, { token: fixture.owner })).body.receipt;
  assert.equal(receipt.sourceQuoteId, quote.id);
  assert.equal(receipt.sourceInvoiceId, invoice.id);
  assert.equal(
    (await request(`/api/quotes/${quote.id}/receipt`, { method: "POST", token: fixture.owner })).response.status,
    409,
  );
  assert.equal(await database.collection("receipts").countDocuments({ sourceQuoteId: new ObjectId(quote.id) }), 1);

  // Both documents are reachable from the quote.
  const links = (await request(`/api/quotes/${quote.id}`, { token: fixture.owner })).body;
  assert.equal(links.invoice.invoiceNumber, invoice.invoiceNumber);
  assert.equal(links.receipt.receiptNumber, issued.body.receipt.receiptNumber);
});

/* ------------------------------------------------------------------- ledger */

test("HKD 10,000 billed, paid and receipted is HKD 10,000 of income", { concurrency: false }, async () => {
  const before = await ledgerIncome();

  const { quote } = await acceptedQuote();
  const invoice = (await request(`/api/quotes/${quote.id}/invoice`, { method: "POST", token: fixture.owner })).body.invoice;
  await request(`/api/invoices/${invoice.id}`, { body: { action: "send" }, method: "PATCH", token: fixture.admin });

  // Accepting the quote must not move the ledger, and neither must sending the
  // invoice: income exists when money is receipted, not when it is promised.
  assert.equal(await ledgerIncome(), before);

  await request(`/api/invoices/${invoice.id}/payments`, {
    body: { amount: 10_000, note: "銀行轉帳", paidAt: "2026-09-01" },
    method: "POST",
    token: fixture.operator,
  });
  // Recording the payment alone is not income either — there is one source of
  // truth and it is the receipt.
  assert.equal(await ledgerIncome(), before);

  const issued = await request(`/api/invoices/${invoice.id}/receipt`, { method: "POST", token: fixture.owner });
  assert.equal(issued.response.status, 201);

  // The release gate: one trade, one recognition. Not 20,000.
  assert.equal(await ledgerIncome(), before + 10_000);

  // And it stays 10,000 however many times the downstream documents are asked for.
  await request(`/api/invoices/${invoice.id}/receipt`, { method: "POST", token: fixture.owner });
  await request(`/api/quotes/${quote.id}/receipt`, { method: "POST", token: fixture.owner });
  await request(`/api/quotes/${quote.id}/invoice`, { method: "POST", token: fixture.owner });
  assert.equal(await ledgerIncome(), before + 10_000);

  // The ledger lists it exactly once, as receipt-backed income.
  const rows = await request(`/api/ledger?q=${issued.body.receipt.receiptNumber}`, { token: fixture.owner });
  assert.equal(rows.body.entries.length, 1);
  assert.equal(rows.body.entries[0].source, "receipt");
  assert.equal(rows.body.entries[0].amount, 10_000);
  assert.equal(rows.body.entries[0].type, "IN");
});

test("instalments are recognised once, when the receipt is issued", { concurrency: false }, async () => {
  const before = await ledgerIncome();
  const invoice = await sentInvoice(10_000);

  await request(`/api/invoices/${invoice.id}/payments`, {
    body: { amount: 3_000, note: "訂金", paidAt: "2026-09-01" },
    method: "POST",
    token: fixture.owner,
  });
  assert.equal(await ledgerIncome(), before, "a part payment is not yet recognised income");

  await request(`/api/invoices/${invoice.id}/payments`, {
    body: { amount: 7_000, note: "尾款", paidAt: "2026-09-02" },
    method: "POST",
    token: fixture.operator,
  });
  const settled = (await request(`/api/invoices/${invoice.id}`, { token: fixture.owner })).body.invoice;
  assert.equal(settled.paidAmount, 10_000);
  assert.equal(settled.outstandingAmount, 0);
  assert.equal(settled.paymentStatus, "paid");
  assert.equal(await ledgerIncome(), before, "collecting the balance is still not the recognition point");

  assert.equal(
    (await request(`/api/invoices/${invoice.id}/receipt`, { method: "POST", token: fixture.owner })).response.status,
    201,
  );
  // Two instalments, one receipt, one recognition of the full amount.
  assert.equal(await ledgerIncome(), before + 10_000);
});

test("the quote-to-receipt route recognises income only on confirmation", { concurrency: false }, async () => {
  const before = await ledgerIncome();
  const { quote } = await acceptedQuote();
  const created = await request(`/api/quotes/${quote.id}/receipt`, { method: "POST", token: fixture.owner });
  assert.equal(created.response.status, 201);
  assert.equal(await ledgerIncome(), before, "a pending receipt is a draft, not income");

  assert.equal(
    (
      await request(`/api/receipts/${created.body.receipt.id}`, {
        body: { paymentStatus: "paid" },
        method: "PUT",
        token: fixture.operator,
      })
    ).response.status,
    200,
  );
  assert.equal(await ledgerIncome(), before + 10_000);

  // Confirming twice is idempotent — the same document, still one income row.
  await request(`/api/receipts/${created.body.receipt.id}`, {
    body: { paymentStatus: "paid" },
    method: "PUT",
    token: fixture.owner,
  });
  assert.equal(await ledgerIncome(), before + 10_000);
});

test("manual income and expense still work alongside the document flow", { concurrency: false }, async () => {
  const opening = (await request("/api/ledger", { token: fixture.owner })).body.summary;

  assert.equal(
    (
      await request("/api/ledger", {
        body: { amount: 250, date: "2026-09-01", description: "利息收入", type: "IN" },
        method: "POST",
        token: fixture.owner,
      })
    ).response.status,
    201,
  );
  assert.equal(
    (
      await request("/api/ledger", {
        body: { amount: 400, date: "2026-09-01", description: "辦公室租金", type: "OUT" },
        method: "POST",
        token: fixture.operator,
      })
    ).response.status,
    201,
  );
  assert.equal(
    (
      await request("/api/ledger", {
        body: { amount: 10, date: "2026-09-01", description: "檢視者不可記帳", type: "OUT" },
        method: "POST",
        token: fixture.viewer,
      })
    ).response.status,
    403,
  );

  const summary = (await request("/api/ledger", { token: fixture.owner })).body.summary;
  assert.equal(summary.income, opening.income + 250);
  assert.equal(summary.expense, opening.expense + 400);
  assert.equal(summary.balance, summary.income - summary.expense);

  // The financial report uses the same ledger endpoint with an inclusive date
  // range, so it must include only the month selected by the user.
  const september = await request("/api/ledger?from=2026-09-01&to=2026-09-30", { token: fixture.owner });
  assert.equal(september.response.status, 200);
  assert.equal(september.body.summary.income, 250);
  assert.equal(september.body.summary.expense, 400);
  assert.deepEqual(september.body.summary, { balance: -150, expense: 400, income: 250 });
  assert.equal((await request("/api/ledger?from=2026-09-31", { token: fixture.owner })).response.status, 400);

  // Every member of the workspace reads the same company totals.
  assert.deepEqual((await request("/api/ledger", { token: fixture.operator })).body.summary, summary);
  assert.deepEqual((await request("/api/ledger", { token: fixture.viewer })).body.summary, summary);

  // And another workspace shares none of it.
  assert.equal((await request("/api/ledger", { token: fixture.outsider })).body.summary.income, 0);
});
