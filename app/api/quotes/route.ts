import { ObjectId } from "mongodb";

import { canManageRecords, getCurrentUser, type AppUser } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";
import {
  calculatedLines, calculatedQuoteTotals, customerFieldsSchema, quoteEffectiveStatus, quotePayloadSchema,
  type CustomerFields, type QuoteLine, type QuotePayload, type QuoteStatus,
} from "@/lib/quotation";

import { customersCollection } from "@/app/api/customers/route";

export const runtime = "nodejs";

export type CompanySnapshot = {
  address: string;
  bankDetails: string;
  businessRegistration: string;
  email: string;
  name: string;
  phone: string;
};
export type QuoteDocument = {
  companySnapshot: CompanySnapshot;
  createdAt: Date;
  createdBy: ObjectId;
  currency: "HKD";
  customerId?: ObjectId;
  customerSnapshot: CustomerFields;
  issueDate: string;
  lines: QuoteLine[];
  notes: string;
  organizationId: ObjectId;
  quoteNumber: string;
  receiptId?: ObjectId;
  status: Exclude<QuoteStatus, "expired">;
  terms: string;
  totalAmount: number;
  totalDiscount: number;
  updatedAt: Date;
  validUntil: string;
};
type QuoteCounter = { createdAt: Date; monthKey: string; sequence: number; updatedAt: Date; userId: ObjectId };

export async function quotesCollection() {
  const collection = (await getDatabase()).collection<QuoteDocument>("quotes");
  await Promise.all([
    collection.createIndex({ organizationId: 1, createdBy: 1, quoteNumber: 1 }, { unique: true }),
    collection.createIndex({ organizationId: 1, createdBy: 1, issueDate: -1, createdAt: -1 }),
    collection.createIndex({ organizationId: 1, createdBy: 1, status: 1, validUntil: 1 }),
  ]);
  return collection;
}

async function quoteCountersCollection() {
  const collection = (await getDatabase()).collection<QuoteCounter>("quoteCounters");
  await collection.createIndex({ userId: 1, monthKey: 1 }, { unique: true });
  return collection;
}

export async function nextQuoteNumber(userId: ObjectId, issueDate: string) {
  const monthKey = issueDate.slice(0, 7).replace("-", "");
  const counters = await quoteCountersCollection();
  // Unique counters plus retry on an initial upsert race make concurrent quote
  // creation safe while keeping the sequence private to its logged-in user.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const counter = await counters.findOneAndUpdate(
        { monthKey, userId },
        { $inc: { sequence: 1 }, $set: { updatedAt: new Date() }, $setOnInsert: { createdAt: new Date(), monthKey, userId } },
        { returnDocument: "after", upsert: true },
      );
      if (!counter) throw new Error("COUNTER_UNAVAILABLE");
      return `QUO-${monthKey}-${String(counter.sequence).padStart(4, "0")}`;
    } catch (error) {
      if (!(typeof error === "object" && error && "code" in error && error.code === 11000) || attempt === 2) throw error;
    }
  }
  throw new Error("COUNTER_UNAVAILABLE");
}

export function companySnapshot(user: AppUser): CompanySnapshot {
  return {
    address: user.organization.address,
    bankDetails: user.organization.bankDetails,
    businessRegistration: user.organization.businessRegistration,
    email: user.organization.email,
    name: user.organization.name,
    phone: user.organization.phone || user.organization.contact,
  };
}

export async function resolveQuotePayload(user: AppUser, input: QuotePayload) {
  let customer = input.customer;
  if (input.customerId) {
    const savedCustomer = await (await customersCollection()).findOne({
      _id: new ObjectId(input.customerId), organizationId: new ObjectId(user.organization.id), createdBy: new ObjectId(user.id),
    });
    if (!savedCustomer) throw new Error("CUSTOMER_NOT_FOUND");
    customer = customerFieldsSchema.parse({
      address: savedCustomer.address, contact: savedCustomer.contact, email: savedCustomer.email,
      name: savedCustomer.name, notes: savedCustomer.notes, phone: savedCustomer.phone,
    });
  }
  const lines = calculatedLines(input.lines);
  return { ...input, customer, lines, ...calculatedQuoteTotals(lines) };
}

function serialize(document: QuoteDocument & { _id: ObjectId }) {
  const status = quoteEffectiveStatus(document.status, document.validUntil);
  return {
    companySnapshot: document.companySnapshot,
    createdAt: document.createdAt.toISOString(),
    currency: document.currency,
    customerId: document.customerId?.toHexString(),
    customerSnapshot: document.customerSnapshot,
    id: document._id.toHexString(),
    issueDate: document.issueDate,
    lines: document.lines,
    notes: document.notes,
    quoteNumber: document.quoteNumber,
    receiptId: document.receiptId?.toHexString(),
    status,
    storedStatus: document.status,
    terms: document.terms,
    totalAmount: document.totalAmount,
    totalDiscount: document.totalDiscount,
    updatedAt: document.updatedAt.toISOString(),
    validUntil: document.validUntil,
  };
}

function escapedRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!await canUseWorkspaceFeature(user, "quotations")) return Response.json({ message: "此工作區目前無法使用報價單功能。" }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get("q")?.trim().slice(0, 100) ?? "";
    const requestedStatus = searchParams.get("status");
    const today = new Date().toISOString().slice(0, 10);
    const filter: Record<string, unknown> = { organizationId: new ObjectId(user.organization.id), createdBy: new ObjectId(user.id) };
    if (requestedStatus === "expired") filter.validUntil = { $lt: today };
    else if (["draft", "sent", "accepted", "rejected"].includes(requestedStatus ?? "")) {
      filter.status = requestedStatus;
      filter.validUntil = { $gte: today };
    }
    if (keyword) {
      const expression = new RegExp(escapedRegex(keyword), "i");
      filter.$or = [{ quoteNumber: expression }, { "customerSnapshot.name": expression }, { "customerSnapshot.contact": expression }];
    }
    const quotes = await (await quotesCollection()).find(filter).sort({ issueDate: -1, createdAt: -1 }).limit(200).toArray();
    return Response.json({ quotes: quotes.map(serialize) });
  } catch {
    return Response.json({ message: "無法讀取報價單。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const parsed = quotePayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "報價單資料不完整或格式不正確。" }, { status: 400 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user)) return Response.json({ message: "你的角色只有檢視權限，無法建立報價單。" }, { status: 403 });
    if (!await canUseWorkspaceFeature(user, "quotations")) return Response.json({ message: "此工作區目前無法使用報價單功能。" }, { status: 403 });
    const resolved = await resolveQuotePayload(user, parsed.data);
    const now = new Date(); const userId = new ObjectId(user.id);
    const document: QuoteDocument = {
      companySnapshot: companySnapshot(user), createdAt: now, createdBy: userId, currency: "HKD",
      customerId: resolved.customerId ? new ObjectId(resolved.customerId) : undefined, customerSnapshot: resolved.customer,
      issueDate: resolved.issueDate, lines: resolved.lines, notes: resolved.notes, organizationId: new ObjectId(user.organization.id),
      quoteNumber: await nextQuoteNumber(userId, resolved.issueDate), status: "draft", terms: resolved.terms,
      totalAmount: resolved.totalAmount, totalDiscount: resolved.totalDiscount, updatedAt: now, validUntil: resolved.validUntil,
    };
    const result = await (await quotesCollection()).insertOne(document);
    return Response.json({ quote: serialize({ ...document, _id: result.insertedId }) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND") return Response.json({ message: "所選客戶不存在或不屬於目前帳號。" }, { status: 404 });
    return Response.json({ message: "無法建立報價單。" }, { status: 503 });
  }
}
