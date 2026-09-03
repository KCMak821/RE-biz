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
const database = client.db(`receipt_issuer_invoice_test_${process.pid}_${randomBytes(6).toString("hex")}`);
let baseUrl = ""; let server; let fixture; let databaseConnected = false;
const customerPayload = (overrides = {}) => ({ address: "Address A", businessRegistration: "BR-A", companyName: "Invoice Customer", contact: "Mia", email: "mia@example.test", name: "Mia Co", notes: "", phone: "123", ...overrides });
const invoicePayload = (customerId, overrides = {}) => ({ customerId, dueDate: "2026-09-30", issueDate: "2026-08-31", lines: [{ description: "", discountAmount: 5, name: "Service", quantity: 2, unitPrice: 100 }], notes: "Invoice note", terms: "30 days", ...overrides });
const quotePayload = (customerId, overrides = {}) => ({ customer: customerPayload(), customerId, issueDate: "2026-08-31", lines: [{ description: "", discountAmount: 0, name: "Quoted service", quantity: 1, unitPrice: 100 }], notes: "Quote note", terms: "Quote terms", validUntil: "2026-09-30", ...overrides });
function hash(token) { return createHash("sha256").update(token).digest("hex"); }
async function port() { const net = createServer(); net.listen(0, "127.0.0.1"); await once(net, "listening"); const address = net.address(); await new Promise((done) => net.close(done)); return address.port; }
async function waitFor(check) { const deadline = Date.now() + 60_000; while (Date.now() < deadline) { if (await check()) return true; await new Promise((done) => setTimeout(done, 200)); } return false; }
async function request(path, { body, method = "GET", token } = {}) { const response = await fetch(`${baseUrl}${path}`, { body: body ? JSON.stringify(body) : undefined, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { cookie: `receipt_session=${token}` } : {}) }, method }); return { body: await response.json().catch(() => null), response }; }
async function session(userId) { const token = randomBytes(32).toString("base64url"); await database.collection("sessions").insertOne({ expiresAt: new Date(Date.now() + 3600_000), tokenHash: hash(token), userId }); return token; }

before(async () => {
  await client.connect(); databaseConnected = true; await database.dropDatabase(); const now = new Date(); const owner = new ObjectId(); const operator = new ObjectId(); const viewer = new ObjectId(); const tenantB = new ObjectId(); const workspace = new ObjectId(); const workspaceB = new ObjectId();
  await database.collection("users").insertMany([owner, operator, viewer, tenantB].map((id, index) => ({ _id: id, accountStatus: "active", createdAt: now, email: `invoice-${index}@example.test`, name: `User ${index}`, passwordHash: "unused" })));
  await database.collection("organizations").insertMany([{ _id: workspace, address: "Company Address A", bankDetails: "Bank A", createdAt: now, createdBy: owner, currency: "HKD", name: "Workspace A", status: "active", timeZone: "Asia/Hong_Kong" }, { _id: workspaceB, createdAt: now, createdBy: tenantB, currency: "HKD", name: "Workspace B", status: "active", timeZone: "Asia/Hong_Kong" }]);
  await database.collection("memberships").insertMany([{ createdAt: now, createdBy: owner, organizationId: workspace, role: "owner", status: "active", userId: owner }, { createdAt: now, createdBy: owner, organizationId: workspace, role: "operator", status: "active", userId: operator }, { createdAt: now, createdBy: owner, organizationId: workspace, role: "viewer", status: "active", userId: viewer }, { createdAt: now, createdBy: tenantB, organizationId: workspaceB, role: "owner", status: "active", userId: tenantB }]);
  fixture = { operator: await session(operator), owner: await session(owner), ownerB: await session(tenantB), viewer: await session(viewer), workspace };
  const available = await port(); baseUrl = `http://127.0.0.1:${available}`; server = spawn(process.execPath, [resolve(root, "node_modules", "next", "dist", "bin", "next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(available)], { cwd: root, env: { ...process.env, MONGODB_DB: database.databaseName, MONGODB_URI: mongoUri, NEXT_TELEMETRY_DISABLED: "1" }, stdio: "ignore" });
  assert.equal(await waitFor(async () => { try { return (await fetch(`${baseUrl}/api/auth/session`)).status === 200; } catch { return false; } }), true);
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

test("manual invoice snapshots, draft workflow, sent lock, overdue and void", { concurrency: false }, async () => {
  const customer = (await request("/api/customers", { body: customerPayload(), method: "POST", token: fixture.owner })).body.customer;
  const created = await request("/api/invoices", { body: invoicePayload(customer.id), method: "POST", token: fixture.owner }); assert.equal(created.response.status, 201); const invoice = created.body.invoice;
  assert.match(invoice.invoiceNumber, /^INV-202608-\d{4}$/); assert.equal(invoice.totalAmount, 195); assert.equal(invoice.customerSnapshot.address, "Address A"); assert.equal(invoice.companySnapshot.address, "Company Address A");
  const filteredList = await request("/api/invoices?q=no-such-invoice", { token: fixture.owner }); assert.equal(filteredList.response.status, 200); assert.equal(filteredList.body.invoices.length, 0); assert.ok(filteredList.body.totalAll >= 1);
  await request(`/api/customers/${customer.id}`, { body: customerPayload({ address: "Address B" }), method: "PUT", token: fixture.owner }); await database.collection("organizations").updateOne({ _id: fixture.workspace }, { $set: { address: "Company Address B" } });
  const snapshot = await request(`/api/invoices/${invoice.id}`, { token: fixture.owner }); assert.equal(snapshot.body.invoice.customerSnapshot.address, "Address A"); assert.equal(snapshot.body.invoice.companySnapshot.address, "Company Address A");
  const edited = await request(`/api/invoices/${invoice.id}`, { body: invoicePayload(customer.id, { dueDate: "2026-09-29", lines: [{ description: "", discountAmount: 0, name: "Edited", quantity: 3, unitPrice: 50 }], notes: "Edited" }), method: "PUT", token: fixture.owner }); assert.equal(edited.response.status, 200); assert.equal(edited.body.invoice.totalAmount, 150);
  assert.equal((await request(`/api/invoices/${invoice.id}`, { body: { action: "send" }, method: "PATCH", token: fixture.owner })).response.status, 200);
  assert.equal((await request(`/api/invoices/${invoice.id}`, { body: invoicePayload(customer.id), method: "PUT", token: fixture.owner })).response.status, 409);
  await database.collection("invoices").updateOne({ _id: new ObjectId(invoice.id) }, { $set: { dueDate: "2020-01-01" } }); assert.equal((await request(`/api/invoices/${invoice.id}`, { token: fixture.owner })).body.invoice.effectiveStatus, "overdue");
  assert.equal((await request(`/api/invoices/${invoice.id}`, { body: { action: "void" }, method: "PATCH", token: fixture.owner })).response.status, 200); assert.equal((await request(`/api/invoices/${invoice.id}`, { body: { action: "send" }, method: "PATCH", token: fixture.owner })).response.status, 409);
});

test("quote conversion uses accepted snapshots and is one-to-one", { concurrency: false }, async () => {
  const customer = (await request("/api/customers", { body: customerPayload({ address: "Quoted Address" }), method: "POST", token: fixture.owner })).body.customer;
  const quote = await request("/api/quotes", { body: quotePayload(customer.id), method: "POST", token: fixture.owner }); assert.equal((await request(`/api/quotes/${quote.body.quote.id}/invoice`, { method: "POST", token: fixture.owner })).response.status, 409);
  const filteredList = await request("/api/quotes?status=rejected", { token: fixture.owner }); assert.equal(filteredList.response.status, 200); assert.equal(filteredList.body.quotes.length, 0); assert.ok(filteredList.body.totalAll >= 1);
  await request(`/api/quotes/${quote.body.quote.id}`, { body: { action: "status", status: "sent" }, method: "PUT", token: fixture.owner }); await request(`/api/quotes/${quote.body.quote.id}`, { body: { action: "status", status: "accepted" }, method: "PUT", token: fixture.owner }); await request(`/api/customers/${customer.id}`, { body: { status: "archived" }, method: "PATCH", token: fixture.owner });
  const converted = await request(`/api/quotes/${quote.body.quote.id}/invoice`, { method: "POST", token: fixture.owner }); assert.equal(converted.response.status, 201); const invoice = await request(`/api/invoices/${converted.body.invoice.id}`, { token: fixture.owner }); assert.equal(invoice.body.invoice.customerSnapshot.address, "Quoted Address"); assert.equal(invoice.body.invoice.sourceQuoteNumber, quote.body.quote.quoteNumber);
  assert.equal((await request(`/api/quotes/${quote.body.quote.id}/invoice`, { method: "POST", token: fixture.owner })).response.status, 409); assert.equal(await database.collection("invoices").countDocuments({ sourceQuoteId: new ObjectId(quote.body.quote.id) }), 1);
});

test("invoice permissions, ownership, feature flags and suspension are enforced", { concurrency: false }, async () => {
  const customer = (await request("/api/customers", { body: customerPayload({ name: "Permissions" }), method: "POST", token: fixture.owner })).body.customer;
  const invoice = (await request("/api/invoices", { body: invoicePayload(customer.id), method: "POST", token: fixture.owner })).body.invoice;
  // The organization is the tenant boundary: a colleague reads the same invoice, another workspace never does.
  assert.equal((await request(`/api/invoices/${invoice.id}`, { token: fixture.operator })).response.status, 200); assert.equal((await request(`/api/invoices/${invoice.id}`, { token: fixture.ownerB })).response.status, 404); assert.equal((await request("/api/invoices", { body: invoicePayload(customer.id), method: "POST", token: fixture.viewer })).response.status, 403); assert.equal((await request(`/api/invoices/${invoice.id}`, { body: { action: "void" }, method: "PATCH", token: fixture.viewer })).response.status, 403);
  await database.collection("workspaceFeatures").updateOne({ organizationId: fixture.workspace, featureKey: "invoices" }, { $set: { enabled: false, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true }); assert.equal((await request("/api/invoices", { token: fixture.owner })).response.status, 403); await database.collection("workspaceFeatures").updateOne({ organizationId: fixture.workspace, featureKey: "invoices" }, { $set: { enabled: true } }); assert.equal((await request("/api/invoices", { token: fixture.owner })).response.status, 200);
  await database.collection("organizations").updateOne({ _id: fixture.workspace }, { $set: { status: "suspended" } }); try { assert.equal((await request("/api/invoices", { body: invoicePayload(customer.id), method: "POST", token: fixture.owner })).response.status, 403); assert.equal((await request(`/api/invoices/${invoice.id}`, { body: { action: "void" }, method: "PATCH", token: fixture.owner })).response.status, 403); } finally { await database.collection("organizations").updateOne({ _id: fixture.workspace }, { $set: { status: "active" } }); }
});
