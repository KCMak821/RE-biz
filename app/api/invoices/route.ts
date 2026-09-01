import { ObjectId } from "mongodb";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { calculatedInvoiceLines, calculatedInvoiceTotals, invoicePayloadSchema } from "@/lib/invoice";
import {
  activeCustomerSnapshot,
  invoicesCollection,
  nextInvoiceNumber,
  serializeInvoice,
  type InvoiceDocument,
} from "@/lib/invoice-store";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";
import { keywordRegex, readKeyword, readPageParams, resolvePage } from "@/lib/query";
import { companySnapshot } from "@/lib/quote-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!await canUseWorkspaceFeature(user, "invoices")) return Response.json({ message: "此工作區目前無法使用請款單功能。" }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const q = readKeyword(searchParams);
    const { page: requestedPage, pageSize } = readPageParams(searchParams);
    const status = searchParams.get("status") ?? "all";
    if (!["all", "draft", "unpaid", "overdue", "partially_paid", "paid", "void"].includes(status)) return Response.json({ message: "請款單狀態篩選不正確。" }, { status: 400 });
    const baseFilter = { organizationId: new ObjectId(user.organization.id), createdBy: new ObjectId(user.id) };
    const filter: Record<string, unknown> = { ...baseFilter };
    if (status === "draft" || status === "void") filter.status = status;
    else if (status === "paid" || status === "partially_paid") { filter.status = "sent"; filter.paymentStatus = status; }
    else if (status === "unpaid") { filter.status = "sent"; filter.paymentStatus = "unpaid"; filter.dueDate = { $gte: new Date().toISOString().slice(0, 10) }; }
    else if (status === "overdue") { filter.status = "sent"; filter.paymentStatus = "unpaid"; filter.dueDate = { $lt: new Date().toISOString().slice(0, 10) }; }
    if (q) { const expression = keywordRegex(q); filter.$or = [{ invoiceNumber: expression }, { "customerSnapshot.name": expression }, { "customerSnapshot.companyName": expression }, { "customerSnapshot.contact": expression }]; }

    const collection = await invoicesCollection();
    // `total` counts the rows matching the current search and filter so the pager
    // is coherent; `totalAll` keeps "no invoices yet" distinguishable from
    // "no matches" in the empty state.
    const [matching, totalAll] = await Promise.all([
      collection.countDocuments(filter),
      collection.countDocuments(baseFilter),
    ]);
    const { page, skip, totalPages } = resolvePage({ page: requestedPage, pageSize, total: matching });
    const invoices = await collection
      .find(filter)
      .sort({ issueDate: -1, createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(pageSize)
      .toArray();
    return Response.json({ invoices: invoices.map(serializeInvoice), page, pageSize, total: matching, totalAll, totalPages });
  } catch { return Response.json({ message: "無法讀取請款單。" }, { status: 503 }); }
}

export async function POST(request: Request) {
  const parsed = invoicePayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "請款單資料不完整或格式不正確。" }, { status: 400 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user)) return Response.json({ message: "你的角色只有檢視權限，無法建立請款單。" }, { status: 403 });
    if (!await canUseWorkspaceFeature(user, "invoices")) return Response.json({ message: "此工作區目前無法使用請款單功能。" }, { status: 403 });
    const lines = calculatedInvoiceLines(parsed.data.lines); const now = new Date(); const organizationId = new ObjectId(user.organization.id);
    const document: InvoiceDocument = { companySnapshot: companySnapshot(user), createdAt: now, createdBy: new ObjectId(user.id), currency: user.organization.currency, customerId: new ObjectId(parsed.data.customerId), customerSnapshot: await activeCustomerSnapshot(user, parsed.data.customerId), dueDate: parsed.data.dueDate, invoiceNumber: await nextInvoiceNumber(organizationId, parsed.data.issueDate), issueDate: parsed.data.issueDate, lines, notes: parsed.data.notes, organizationId, payments: [], paymentStatus: "unpaid", status: "draft", terms: parsed.data.terms, ...calculatedInvoiceTotals(lines), updatedAt: now };
    const result = await (await invoicesCollection()).insertOne(document);
    return Response.json({ invoice: serializeInvoice({ ...document, _id: result.insertedId }) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND") return Response.json({ message: "所選客戶不存在、已封存或不屬於目前工作區。" }, { status: 404 });
    return Response.json({ message: "無法建立請款單。" }, { status: 503 });
  }
}
