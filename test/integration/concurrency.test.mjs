/**
 * The races, tested as races.
 *
 * Every case here fires two conflicting requests with `Promise.all` and then
 * asks the database what actually happened. "Read, decide, then write" is not
 * enough for any of them — each one is settled by a single conditional write,
 * and these tests exist to prove the loser really loses rather than quietly
 * corrupting the workspace.
 *
 * A race that only interleaves sometimes is not a passing test, so the three
 * P1 cases are each run `ATTEMPTS` times against fresh documents.
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
const database = client.db(`receipt_issuer_concurrency_test_${process.pid}_${randomBytes(6).toString("hex")}`);

/** Enough repetitions that a genuinely unguarded write would be caught. */
const ATTEMPTS = 6;

let baseUrl = "";
let server;
let fixture;
let databaseConnected = false;

/* ------------------------------------------------------------------ helpers */

const customerPayload = (overrides = {}) => ({
  address: "香港中環 1 號",
  businessRegistration: "BR-777",
  companyName: "Race Customer Ltd",
  contact: "測試",
  email: "race@example.test",
  name: "Race Customer",
  notes: "",
  phone: "12345678",
  ...overrides,
});

const quotePayload = (customerId) => ({
  customer: customerPayload(),
  customerId,
  issueDate: "2026-08-01",
  lines: [{ description: "", discountAmount: 0, name: "顧問服務", quantity: 1, unitPrice: 5_000 }],
  notes: "",
  terms: "",
  validUntil: "2036-08-31",
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

let customerId;

/** A quote that has been sent but not yet decided. */
async function sentQuote() {
  const created = await request("/api/quotes", { body: quotePayload(customerId), method: "POST", token: fixture.owner });
  assert.equal(created.response.status, 201);
  const { id } = created.body.quote;
  assert.equal(
    (await request(`/api/quotes/${id}`, { body: { action: "status", status: "sent" }, method: "PUT", token: fixture.owner }))
      .response.status,
    200,
  );
  return created.body.quote;
}

/** A quote the customer has accepted, ready for either settlement route. */
async function acceptedQuote() {
  const quote = await sentQuote();
  assert.equal(
    (
      await request(`/api/quotes/${quote.id}`, {
        body: { action: "status", status: "accepted" },
        method: "PUT",
        token: fixture.owner,
      })
    ).response.status,
    200,
  );
  return quote;
}

/** A sent invoice for `amount`, ready to be collected against or voided. */
async function sentInvoice(amount) {
  const created = await request("/api/invoices", {
    body: {
      customerId,
      dueDate: "2036-09-30",
      issueDate: "2026-08-01",
      lines: [{ description: "", discountAmount: 0, name: "顧問服務", quantity: 1, unitPrice: amount }],
      notes: "",
      terms: "",
    },
    method: "POST",
    token: fixture.owner,
  });
  assert.equal(created.response.status, 201);
  const sent = await request(`/api/invoices/${created.body.invoice.id}`, {
    body: { action: "send" },
    method: "PATCH",
    token: fixture.owner,
  });
  assert.equal(sent.response.status, 200);
  return sent.body.invoice;
}

const succeeded = (result) => result.response.status < 400;

/* -------------------------------------------------------------------- setup */

before(async () => {
  await client.connect();
  databaseConnected = true;
  await database.dropDatabase();

  const now = new Date();
  const owner = new ObjectId();
  const operator = new ObjectId();
  const outsider = new ObjectId();
  const workspace = new ObjectId();
  const otherWorkspace = new ObjectId();

  await database.collection("users").insertMany(
    [owner, operator, outsider].map((id, index) => ({
      _id: id,
      accountStatus: "active",
      createdAt: now,
      email: `race-${index}@example.test`,
      name: `Race User ${index}`,
      passwordHash: "unused",
      platformRole: "USER",
    })),
  );
  await database.collection("organizations").insertMany([
    {
      _id: workspace,
      address: "香港九龍 1 號",
      createdAt: now,
      createdBy: owner,
      currency: "HKD",
      name: "Race 工作區",
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
    { createdAt: now, createdBy: owner, organizationId: workspace, role: "operator", status: "active", userId: operator },
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
    operator: await session(operator),
    outsider: await session(outsider),
    owner: await session(owner),
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

  customerId = (await request("/api/customers", { body: customerPayload(), method: "POST", token: fixture.owner })).body
    .customer.id;
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

/* ------------------------------- P1 #1: quote → invoice vs quote → receipt */

test("a quote cannot be billed and receipted at the same time", { concurrency: false }, async () => {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const quote = await acceptedQuote();
    const quoteId = new ObjectId(quote.id);

    // Two colleagues decide the settlement route at the same instant.
    const [billing, receipting] = await Promise.all([
      request(`/api/quotes/${quote.id}/invoice`, { method: "POST", token: fixture.owner }),
      request(`/api/quotes/${quote.id}/receipt`, { method: "POST", token: fixture.operator }),
    ]);

    const outcome = `attempt ${attempt}: invoice=${billing.response.status} receipt=${receipting.response.status}`;
    assert.equal(succeeded(billing) !== succeeded(receipting), true, `exactly one route must win — ${outcome}`);
    assert.equal(succeeded(billing) ? billing.response.status : receipting.response.status, 201, outcome);
    assert.equal(succeeded(billing) ? receipting.response.status : billing.response.status, 409, outcome);

    // The database is the real assertion: one downstream document, never two.
    const [invoices, receipts] = await Promise.all([
      database.collection("invoices").countDocuments({ sourceQuoteId: quoteId }),
      database.collection("receipts").countDocuments({ sourceQuoteId: quoteId }),
    ]);
    assert.equal(invoices + receipts, 1, `${outcome} — invoices=${invoices} receipts=${receipts}`);
    assert.equal(invoices === 1 ? receipts : invoices, 0, outcome);

    // The claim recorded on the quote agrees with the document that exists.
    const stored = await database.collection("quotes").findOne({ _id: quoteId });
    assert.equal(stored.settlementPath, invoices === 1 ? "invoice" : "receipt", outcome);

    // The losing route stays closed on every later attempt, not just this one.
    const retryLoser = invoices === 1 ? "receipt" : "invoice";
    const retry = await request(`/api/quotes/${quote.id}/${retryLoser}`, { method: "POST", token: fixture.owner });
    assert.equal(retry.response.status, 409, outcome);
  }
});

test("a claimed route may be retried after a failed insert, and only that route", { concurrency: false }, async () => {
  // Simulates the claim surviving while the downstream insert did not: the quote
  // holds "invoice" but no invoice exists.
  const quote = await acceptedQuote();
  await database
    .collection("quotes")
    .updateOne({ _id: new ObjectId(quote.id) }, { $set: { settlementPath: "invoice" } });

  // The other route is refused even though nothing has been created yet.
  const receipt = await request(`/api/quotes/${quote.id}/receipt`, { method: "POST", token: fixture.owner });
  assert.equal(receipt.response.status, 409);
  assert.match(receipt.body.message, /請款單/);

  // The claimed route resumes and completes.
  const retried = await request(`/api/quotes/${quote.id}/invoice`, { method: "POST", token: fixture.owner });
  assert.equal(retried.response.status, 201);

  // Retrying once more now finds the document and says so, rather than duplicating it.
  const again = await request(`/api/quotes/${quote.id}/invoice`, { method: "POST", token: fixture.owner });
  assert.equal(again.response.status, 409);
  assert.equal(await database.collection("invoices").countDocuments({ sourceQuoteId: new ObjectId(quote.id) }), 1);
});

test("quotes settled before the claim existed keep their route", { concurrency: false }, async () => {
  const quote = await acceptedQuote();
  assert.equal((await request(`/api/quotes/${quote.id}/invoice`, { method: "POST", token: fixture.owner })).response.status, 201);

  // Strip the claim, leaving exactly the shape of a quote billed before this
  // field existed and never touched by the migration.
  await database.collection("quotes").updateOne({ _id: new ObjectId(quote.id) }, { $unset: { settlementPath: "" } });

  const receipt = await request(`/api/quotes/${quote.id}/receipt`, { method: "POST", token: fixture.owner });
  assert.equal(receipt.response.status, 409);
  assert.equal(await database.collection("receipts").countDocuments({ sourceQuoteId: new ObjectId(quote.id) }), 0);
});

test("the settlement race respects roles and the tenant boundary", { concurrency: false }, async () => {
  const quote = await acceptedQuote();

  // Another workspace loses both routes without leaving a claim behind.
  const [invoice, receipt] = await Promise.all([
    request(`/api/quotes/${quote.id}/invoice`, { method: "POST", token: fixture.outsider }),
    request(`/api/quotes/${quote.id}/receipt`, { method: "POST", token: fixture.outsider }),
  ]);
  assert.equal(invoice.response.status, 404);
  assert.equal(receipt.response.status, 404);
  const untouched = await database.collection("quotes").findOne({ _id: new ObjectId(quote.id) });
  assert.equal(untouched.settlementPath, undefined);

  // A colleague in the same workspace settles the quote the owner created.
  assert.equal(
    (await request(`/api/quotes/${quote.id}/receipt`, { method: "POST", token: fixture.operator })).response.status,
    201,
  );
  const claimed = await database.collection("quotes").findOne({ _id: new ObjectId(quote.id) });
  assert.equal(claimed.settlementPath, "receipt");
});

/* ------------------------------------------ P1 #2: invoice payment vs void */

test("a payment and a void cannot both land on one invoice", { concurrency: false }, async () => {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const invoice = await sentInvoice(1_000);

    const [payment, voided] = await Promise.all([
      request(`/api/invoices/${invoice.id}/payments`, {
        body: { amount: 400, note: "", paidAt: "2026-09-01", paymentMethod: "銀行轉帳", reference: "" },
        method: "POST",
        token: fixture.owner,
      }),
      request(`/api/invoices/${invoice.id}`, { body: { action: "void" }, method: "PATCH", token: fixture.operator }),
    ]);

    const outcome = `attempt ${attempt}: payment=${payment.response.status} void=${voided.response.status}`;
    assert.equal(succeeded(payment) !== succeeded(voided), true, `exactly one must win — ${outcome}`);

    const stored = await database.collection("invoices").findOne({ _id: new ObjectId(invoice.id) });
    const recorded = (stored.payments ?? []).length;

    // The state this test exists to make impossible.
    assert.equal(
      stored.status === "void" && recorded > 0,
      false,
      `a voided invoice must hold no payments — ${outcome}`,
    );

    if (succeeded(payment)) {
      assert.equal(stored.status, "sent", outcome);
      assert.equal(recorded, 1, outcome);
      assert.equal(stored.paymentStatus, "partially_paid", outcome);
    } else {
      assert.equal(stored.status, "void", outcome);
      assert.equal(recorded, 0, outcome);
      assert.equal(stored.paymentStatus, "unpaid", outcome);
    }
  }
});

/* ------------------------------------------- P1 #3: quote accept vs reject */

test("a quote cannot be accepted and rejected at the same time", { concurrency: false }, async () => {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const quote = await sentQuote();

    const [accept, reject] = await Promise.all([
      request(`/api/quotes/${quote.id}`, { body: { action: "status", status: "accepted" }, method: "PUT", token: fixture.owner }),
      request(`/api/quotes/${quote.id}`, {
        body: { action: "status", status: "rejected" },
        method: "PUT",
        token: fixture.operator,
      }),
    ]);

    const outcome = `attempt ${attempt}: accept=${accept.response.status} reject=${reject.response.status}`;
    assert.equal(succeeded(accept) !== succeeded(reject), true, `exactly one decision must stick — ${outcome}`);
    assert.equal(succeeded(accept) ? accept.response.status : reject.response.status, 200, outcome);
    assert.equal(succeeded(accept) ? reject.response.status : accept.response.status, 409, outcome);

    // One deterministic terminal status, and it is the one that reported success.
    const stored = await database.collection("quotes").findOne({ _id: new ObjectId(quote.id) });
    assert.equal(stored.status, succeeded(accept) ? "accepted" : "rejected", outcome);
    assert.equal((await request(`/api/quotes/${quote.id}`, { token: fixture.owner })).body.quote.status, stored.status, outcome);

    // And the decision is final either way.
    const reopen = await request(`/api/quotes/${quote.id}`, {
      body: { action: "status", status: "sent" },
      method: "PUT",
      token: fixture.owner,
    });
    assert.equal(reopen.response.status, 409, outcome);
  }
});

/* --------------------------------------------------- payment semantic model */

test("a payment records how the money arrived, separately from the team's note", { concurrency: false }, async () => {
  const invoice = await sentInvoice(2_000);
  const recorded = await request(`/api/invoices/${invoice.id}/payments`, {
    body: { amount: 2_000, note: "尾款，客戶要求開發票", paidAt: "2026-09-01", paymentMethod: "銀行轉帳", reference: "HSBC-88231" },
    method: "POST",
    token: fixture.owner,
  });
  assert.equal(recorded.response.status, 201);
  const [payment] = recorded.body.invoice.payments;
  assert.equal(payment.paymentMethod, "銀行轉帳");
  assert.equal(payment.reference, "HSBC-88231");
  assert.equal(payment.note, "尾款，客戶要求開發票");

  // The receipt states the payment method, not the internal note.
  const issued = await request(`/api/invoices/${invoice.id}/receipt`, { method: "POST", token: fixture.owner });
  assert.equal(issued.response.status, 201);
  const receipt = (await request(`/api/receipts/${issued.body.receipt.id}`, { token: fixture.owner })).body.receipt;
  assert.equal(receipt.paymentMethod, "銀行轉帳");

  // The fields are optional, so a client that sends neither still works.
  const plain = await sentInvoice(500);
  const minimal = await request(`/api/invoices/${plain.id}/payments`, {
    body: { amount: 500, paidAt: "2026-09-01" },
    method: "POST",
    token: fixture.owner,
  });
  assert.equal(minimal.response.status, 201);
  assert.equal(minimal.body.invoice.payments[0].paymentMethod, "");
  assert.equal(minimal.body.invoice.payments[0].reference, "");
});

test("payments recorded before the model gained these fields still read back", { concurrency: false }, async () => {
  const invoice = await sentInvoice(1_000);
  // Exactly the shape written by the previous release: no paymentMethod, no
  // reference, no createdByName.
  await database.collection("invoices").updateOne(
    { _id: new ObjectId(invoice.id) },
    {
      $push: {
        payments: {
          _id: new ObjectId(),
          amount: 1_000,
          createdAt: new Date(),
          createdBy: new ObjectId(),
          note: "舊資料",
          paidAt: "2026-09-01",
        },
      },
      $set: { paymentStatus: "paid" },
    },
  );

  const read = await request(`/api/invoices/${invoice.id}`, { token: fixture.owner });
  assert.equal(read.response.status, 200);
  const [legacy] = read.body.invoice.payments;
  assert.equal(legacy.paymentMethod, "");
  assert.equal(legacy.reference, "");
  assert.equal(legacy.createdByName, "");
  assert.equal(read.body.invoice.paidAmount, 1_000);
  assert.equal(read.body.invoice.effectiveStatus, "paid");

  // A receipt issued from it falls back to a sensible method rather than blank.
  const issued = await request(`/api/invoices/${invoice.id}/receipt`, { method: "POST", token: fixture.owner });
  assert.equal(issued.response.status, 201);
  const receipt = (await request(`/api/receipts/${issued.body.receipt.id}`, { token: fixture.owner })).body.receipt;
  assert.equal(receipt.paymentMethod, "已收款");
});
