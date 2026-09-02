import { ObjectId } from "mongodb";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";
import {
  quoteEffectiveStatus, quotePayloadSchema,
} from "@/lib/quotation";

import { keywordRegex, readKeyword, readPageParams, resolvePage } from "@/lib/query";
import { companySnapshot, nextQuoteNumber, quotesCollection, resolveQuotePayload, type QuoteDocument } from "@/lib/quote-store";

export const runtime = "nodejs";

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
    invoiceId: document.invoiceId?.toHexString(),
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

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!await canUseWorkspaceFeature(user, "quotations")) return Response.json({ message: "此工作區目前無法使用報價單功能。" }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const keyword = readKeyword(searchParams);
    const { page: requestedPage, pageSize } = readPageParams(searchParams);
    const requestedStatus = searchParams.get("status");
    const today = new Date().toISOString().slice(0, 10);
    const baseFilter = { organizationId: new ObjectId(user.organization.id) };
    const filter: Record<string, unknown> = { ...baseFilter };
    // Only a quote still awaiting an answer lapses, so the expiry window is
    // part of the sent filter and of nothing else — an accepted quote stays
    // findable under "accepted" however old it is.
    if (requestedStatus === "expired") {
      filter.status = "sent";
      filter.validUntil = { $lt: today };
    } else if (requestedStatus === "sent") {
      filter.status = "sent";
      filter.validUntil = { $gte: today };
    } else if (["draft", "accepted", "rejected"].includes(requestedStatus ?? "")) {
      filter.status = requestedStatus;
    }
    if (keyword) {
      const expression = keywordRegex(keyword);
      filter.$or = [{ quoteNumber: expression }, { "customerSnapshot.name": expression }, { "customerSnapshot.contact": expression }];
    }
    const collection = await quotesCollection();
    // `total` counts the rows the current search and filter match, so the
    // pager reflects what is actually reachable. `totalAll` keeps the
    // "no quotes at all yet" empty state distinguishable from "no matches".
    const [matching, totalAll] = await Promise.all([
      collection.countDocuments(filter),
      collection.countDocuments(baseFilter),
    ]);
    const { page, skip, totalPages } = resolvePage({ page: requestedPage, pageSize, total: matching });
    const quotes = await collection
      .find(filter)
      .sort({ issueDate: -1, createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(pageSize)
      .toArray();
    return Response.json({ page, pageSize, quotes: quotes.map(serialize), total: matching, totalAll, totalPages });
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
    const now = new Date(); const userId = new ObjectId(user.id); const organizationId = new ObjectId(user.organization.id);
    const document: QuoteDocument = {
      companySnapshot: companySnapshot(user), createdAt: now, createdBy: userId, currency: "HKD",
      customerId: resolved.customerId ? new ObjectId(resolved.customerId) : undefined, customerSnapshot: resolved.customer,
      issueDate: resolved.issueDate, lines: resolved.lines, notes: resolved.notes, organizationId,
      quoteNumber: await nextQuoteNumber(organizationId, resolved.issueDate), status: "draft", terms: resolved.terms,
      totalAmount: resolved.totalAmount, totalDiscount: resolved.totalDiscount, updatedAt: now, validUntil: resolved.validUntil,
    };
    const result = await (await quotesCollection()).insertOne(document);
    return Response.json({ quote: serialize({ ...document, _id: result.insertedId }) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND") return Response.json({ message: "所選客戶不存在或不屬於目前帳號。" }, { status: 404 });
    return Response.json({ message: "無法建立報價單。" }, { status: 503 });
  }
}
