import { ObjectId } from "mongodb";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { invoicesCollection, nextInvoiceNumber, quoteInvoiceFields, type InvoiceDocument } from "@/lib/invoice-store";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";
import { quoteEffectiveStatus } from "@/lib/quotation";
import { claimSettlementPath, quotesCollection } from "@/lib/quote-store";
import { receiptsCollection } from "@/lib/receipt-store";

export const runtime = "nodejs";

/**
 * Turns an accepted quote into a draft invoice, carrying every snapshot across
 * so nothing has to be typed twice.
 *
 * Two guarantees, both held by the database rather than by the checks below:
 * `claimSettlementPath` decides atomically whether this trade is billed or
 * receipted, and the partial unique index on `{ organizationId, sourceQuoteId }`
 * stops a second invoice for the same quote. The reads before them exist only to
 * produce a better message than a constraint violation would.
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

    const receipts = await receiptsCollection();
    /* Quotes settled before the settlement path existed carry no claim, so the
       receipt itself is still consulted. New quotes are decided by the claim
       below; this only keeps the message right for historical data. */
    const receipted = await receipts.findOne({ organizationId, sourceQuoteId: id });
    if (receipted)
      return Response.json(
        {
          message: `此報價單已直接建立收據 ${receipted.receiptNumber}，不需要再開請款單。`,
          receipt: { id: receipted._id.toHexString(), receiptNumber: receipted.receiptNumber },
        },
        { status: 409 },
      );

    /* The decisive step: one conditional update settles which of the two routes
       this trade takes, so a simultaneous receipt request cannot also win. */
    const claim = await claimSettlementPath(organizationId, id, "invoice");
    if (claim.kind === "unavailable")
      return Response.json({ message: "報價單狀態已變更，請重新整理後再試。" }, { status: 409 });
    if (claim.kind === "taken") {
      const winner = await receipts.findOne({ organizationId, sourceQuoteId: id });
      return Response.json(
        {
          message: winner
            ? `此報價單已直接建立收據 ${winner.receiptNumber}，不需要再開請款單。`
            : "此報價單已選擇直接開立收據，不可再建立請款單。",
          ...(winner ? { receipt: { id: winner._id.toHexString(), receiptNumber: winner.receiptNumber } } : {}),
        },
        { status: 409 },
      );
    }

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
      // Two requests both held the invoice claim — the unique index picked one.
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
