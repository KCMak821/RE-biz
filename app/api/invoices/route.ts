import { ObjectId } from "mongodb";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { invoiceEffectiveStatus, invoicePayloadSchema } from "@/lib/invoice";
import { activeCustomerSnapshot, invoicesCollection, nextInvoiceNumber, type InvoiceDocument } from "@/lib/invoice-store";
import { companySnapshot } from "@/lib/quote-store";
import { calculatedInvoiceLines, calculatedInvoiceTotals } from "@/lib/invoice";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";

export const runtime = "nodejs";
function serialize(document: InvoiceDocument & { _id: ObjectId }) {
  return { companySnapshot: document.companySnapshot, createdAt: document.createdAt.toISOString(), currency: document.currency, customerId: document.customerId?.toHexString(), customerSnapshot: document.customerSnapshot, dueDate: document.dueDate, effectiveStatus: invoiceEffectiveStatus(document.status, document.paymentStatus, document.dueDate), id: document._id.toHexString(), invoiceNumber: document.invoiceNumber, issueDate: document.issueDate, lines: document.lines, notes: document.notes, paymentStatus: document.paymentStatus, sentAt: document.sentAt?.toISOString(), sourceQuoteId: document.sourceQuoteId?.toHexString(), sourceQuoteNumber: document.sourceQuoteNumber, status: document.status, terms: document.terms, totalAmount: document.totalAmount, totalDiscount: document.totalDiscount, updatedAt: document.updatedAt.toISOString() };
}
function escapedRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!await canUseWorkspaceFeature(user, "invoices")) return Response.json({ message: "此工作區目前無法使用請款單功能。" }, { status: 403 });
    const { searchParams } = new URL(request.url); const q = searchParams.get("q")?.trim().slice(0, 100) ?? ""; const status = searchParams.get("status") ?? "all";
    if (!["all", "draft", "unpaid", "overdue", "partially_paid", "paid", "void"].includes(status)) return Response.json({ message: "請款單狀態篩選不正確。" }, { status: 400 });
    const baseFilter = { organizationId: new ObjectId(user.organization.id), createdBy: new ObjectId(user.id) };
    const filter: Record<string, unknown> = { ...baseFilter };
    if (status === "draft" || status === "void") filter.status = status;
    else if (status === "paid" || status === "partially_paid") { filter.status = "sent"; filter.paymentStatus = status; }
    else if (status === "unpaid") { filter.status = "sent"; filter.paymentStatus = "unpaid"; filter.dueDate = { $gte: new Date().toISOString().slice(0, 10) }; }
    else if (status === "overdue") { filter.status = "sent"; filter.paymentStatus = "unpaid"; filter.dueDate = { $lt: new Date().toISOString().slice(0, 10) }; }
    if (q) { const expression = new RegExp(escapedRegex(q), "i"); filter.$or = [{ invoiceNumber: expression }, { "customerSnapshot.name": expression }, { "customerSnapshot.companyName": expression }, { "customerSnapshot.contact": expression }]; }
    const collection = await invoicesCollection();
    const [invoices, total] = await Promise.all([
      collection.find(filter).sort({ issueDate: -1, createdAt: -1 }).limit(200).toArray(),
      collection.countDocuments(baseFilter),
    ]);
    return Response.json({ invoices: invoices.map(serialize), total });
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
    const document: InvoiceDocument = { companySnapshot: companySnapshot(user), createdAt: now, createdBy: new ObjectId(user.id), currency: user.organization.currency, customerId: new ObjectId(parsed.data.customerId), customerSnapshot: await activeCustomerSnapshot(user, parsed.data.customerId), dueDate: parsed.data.dueDate, invoiceNumber: await nextInvoiceNumber(organizationId, parsed.data.issueDate), issueDate: parsed.data.issueDate, lines, notes: parsed.data.notes, organizationId, paymentStatus: "unpaid", status: "draft", terms: parsed.data.terms, ...calculatedInvoiceTotals(lines), updatedAt: now };
    const result = await (await invoicesCollection()).insertOne(document);
    return Response.json({ invoice: serialize({ ...document, _id: result.insertedId }) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "CUSTOMER_NOT_FOUND") return Response.json({ message: "所選客戶不存在、已封存或不屬於目前工作區。" }, { status: 404 });
    return Response.json({ message: "無法建立請款單。" }, { status: 503 });
  }
}
export { serialize };
