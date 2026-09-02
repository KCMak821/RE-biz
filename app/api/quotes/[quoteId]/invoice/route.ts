import { ObjectId } from "mongodb";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { invoicesCollection, nextInvoiceNumber, quoteInvoiceFields, type InvoiceDocument } from "@/lib/invoice-store";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";
import { quoteEffectiveStatus } from "@/lib/quotation";
import { quotesCollection } from "@/lib/quote-store";
import { receiptsCollection } from "@/lib/receipt-store";

export const runtime = "nodejs";

/**
 * Turns an accepted quote into a draft invoice, carrying every snapshot across
 * so nothing has to be typed twice.
 *
 * One quote yields at most one invoice — guaranteed by the partial unique index
 * on `{ organizationId, sourceQuoteId }`, not by the check below, so two
 * simultaneous clicks cannot both succeed.
 */
export async function POST(_: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;
  if (!ObjectId.isValid(quoteId)) return Response.json({ message: "報價單不存在。" }, { status: 404 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user)) return Response.json({ message: "你的角色只有檢視權限，無法建立請款單。" }, { status: 403 });
    if (!(await canUseWorkspaceFeature(user, "invoices")))
      return Response.json({ message: "此工作區目前無法使用請款單功能。" }, { status: 403 });

    const organizationId = new ObjectId(user.organization.id);
    const createdBy = new ObjectId(user.id);
    const id = new ObjectId(quoteId);
    const quote = await (await quotesCollection()).findOne({ _id: id, organizationId });
    if (!quote) return Response.json({ message: "報價單不存在。" }, { status: 404 });
    if (quoteEffectiveStatus(quote.status, quote.validUntil) !== "accepted")
      return Response.json({ message: "只有已接受的報價單可以建立請款單。" }, { status: 409 });

    const invoices = await invoicesCollection();
    const existing = await invoices.findOne({ organizationId, sourceQuoteId: id });
    if (existing)
      return Response.json(
        { invoice: { id: existing._id.toHexString(), invoiceNumber: existing.invoiceNumber }, message: "此報價單已經建立請款單。" },
        { status: 409 },
      );

    /* The two routes out of an accepted quote are alternatives, not stages: a
       quote settled straight into a receipt has already been recognised as
       income, so billing it again would describe the same money twice. */
    const receipted = await (await receiptsCollection()).findOne({ organizationId, sourceQuoteId: id });
    if (receipted)
      return Response.json(
        {
          message: `此報價單已直接建立收據 ${receipted.receiptNumber}，不需要再開請款單。`,
          receipt: { id: receipted._id.toHexString(), receiptNumber: receipted.receiptNumber },
        },
        { status: 409 },
      );

    const now = new Date();
    const issueDate = now.toISOString().slice(0, 10);
    const invoice: InvoiceDocument = {
      ...quoteInvoiceFields(quote),
      createdAt: now,
      createdBy,
      // An accepted quote's validity date is what the customer agreed to pay by.
      dueDate: quote.validUntil >= issueDate ? quote.validUntil : issueDate,
      invoiceNumber: await nextInvoiceNumber(organizationId, issueDate),
      issueDate,
      organizationId,
      payments: [],
      paymentStatus: "unpaid",
      sourceQuoteId: id,
      sourceQuoteNumber: quote.quoteNumber,
      status: "draft",
      updatedAt: now,
    };

    try {
      const result = await invoices.insertOne(invoice);
      await (await quotesCollection()).updateOne({ _id: id, organizationId }, { $set: { invoiceId: result.insertedId, updatedAt: now } });
      return Response.json({ invoice: { id: result.insertedId.toHexString(), invoiceNumber: invoice.invoiceNumber } }, { status: 201 });
    } catch (error) {
      if (!(typeof error === "object" && error && "code" in error && error.code === 11000)) throw error;
      const duplicate = await invoices.findOne({ organizationId, sourceQuoteId: id });
      if (!duplicate) throw error;
      await (await quotesCollection()).updateOne({ _id: id, organizationId }, { $set: { invoiceId: duplicate._id, updatedAt: new Date() } });
      return Response.json(
        { invoice: { id: duplicate._id.toHexString(), invoiceNumber: duplicate.invoiceNumber }, message: "此報價單已經建立請款單。" },
        { status: 409 },
      );
    }
  } catch {
    return Response.json({ message: "無法建立請款單。" }, { status: 503 });
  }
}
