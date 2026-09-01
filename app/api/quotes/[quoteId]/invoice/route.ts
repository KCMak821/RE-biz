import { ObjectId } from "mongodb";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { invoicesCollection, nextInvoiceNumber, quoteInvoiceFields, type InvoiceDocument } from "@/lib/invoice-store";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";
import { quoteEffectiveStatus } from "@/lib/quotation";
import { quotesCollection } from "@/lib/quote-store";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;
  if (!ObjectId.isValid(quoteId)) return Response.json({ message: "報價單不存在。" }, { status: 404 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user)) return Response.json({ message: "你的角色只有檢視權限，無法建立請款單。" }, { status: 403 });
    if (!await canUseWorkspaceFeature(user, "invoices")) return Response.json({ message: "此工作區目前無法使用請款單功能。" }, { status: 403 });
    const organizationId = new ObjectId(user.organization.id); const createdBy = new ObjectId(user.id); const id = new ObjectId(quoteId);
    const quote = await (await quotesCollection()).findOne({ _id: id, organizationId, createdBy });
    if (!quote) return Response.json({ message: "報價單不存在。" }, { status: 404 });
    if (quoteEffectiveStatus(quote.status, quote.validUntil) !== "accepted") return Response.json({ message: "只有已接受且未失效的報價單可轉為請款單。" }, { status: 409 });
    const invoices = await invoicesCollection(); const existing = await invoices.findOne({ sourceQuoteId: id, organizationId });
    if (existing) return Response.json({ message: "此報價單已建立請款單。", invoice: { id: existing._id.toHexString(), invoiceNumber: existing.invoiceNumber } }, { status: 409 });
    const now = new Date(); const fields = quoteInvoiceFields(quote);
    const invoice: InvoiceDocument = { ...fields, createdAt: now, createdBy, dueDate: quote.validUntil, invoiceNumber: await nextInvoiceNumber(organizationId, now.toISOString().slice(0, 10)), issueDate: now.toISOString().slice(0, 10), organizationId, payments: [], paymentStatus: "unpaid", sourceQuoteId: id, sourceQuoteNumber: quote.quoteNumber, status: "draft", updatedAt: now };
    try {
      const result = await invoices.insertOne(invoice);
      await (await quotesCollection()).updateOne({ _id: id, organizationId, createdBy }, { $set: { invoiceId: result.insertedId, updatedAt: now } });
      return Response.json({ invoice: { id: result.insertedId.toHexString(), invoiceNumber: invoice.invoiceNumber } }, { status: 201 });
    } catch (error) {
      if (!(typeof error === "object" && error && "code" in error && error.code === 11000)) throw error;
      const duplicate = await invoices.findOne({ sourceQuoteId: id, organizationId });
      if (!duplicate) throw error;
      await (await quotesCollection()).updateOne({ _id: id, organizationId, createdBy }, { $set: { invoiceId: duplicate._id, updatedAt: new Date() } });
      return Response.json({ message: "此報價單已建立請款單。", invoice: { id: duplicate._id.toHexString(), invoiceNumber: duplicate.invoiceNumber } }, { status: 409 });
    }
  } catch { return Response.json({ message: "無法建立請款單。" }, { status: 503 }); }
}
