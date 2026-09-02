import { ObjectId } from "mongodb";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { invoicesCollection } from "@/lib/invoice-store";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";
import { quoteEffectiveStatus } from "@/lib/quotation";
import { quotesCollection } from "@/lib/quote-store";
import { nextReceiptNumbers, receiptsCollection, type ReceiptDocument } from "@/lib/receipt-store";

export const runtime = "nodejs";

/**
 * The short path: an accepted quote paid on the spot, with no invoice in
 * between. The receipt starts as "待收款" and only becomes income once the money
 * is confirmed, which is what keeps this path and the invoice path from ever
 * describing the same trade twice.
 */
export async function POST(_: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;
  if (!ObjectId.isValid(quoteId)) return Response.json({ message: "報價單不存在。" }, { status: 404 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user)) return Response.json({ message: "你的角色只有檢視權限，無法建立收據草稿。" }, { status: 403 });
    if (!(await canUseWorkspaceFeature(user, "quotations")) || !(await canUseWorkspaceFeature(user, "receipts")))
      return Response.json({ message: "此工作區目前無法建立報價單收據。" }, { status: 403 });

    const organizationId = new ObjectId(user.organization.id);
    const userId = new ObjectId(user.id);
    const id = new ObjectId(quoteId);
    const quote = await (await quotesCollection()).findOne({ _id: id, organizationId });
    if (!quote) return Response.json({ message: "報價單不存在。" }, { status: 404 });
    if (quoteEffectiveStatus(quote.status, quote.validUntil) !== "accepted")
      return Response.json({ message: "只有已接受的報價單可以建立收據草稿。" }, { status: 409 });

    const receipts = await receiptsCollection();
    const existing = await receipts.findOne({ organizationId, sourceQuoteId: id });
    if (existing)
      return Response.json(
        { message: "此報價單已經建立收據。", receipt: { id: existing._id.toHexString(), receiptNumber: existing.receiptNumber } },
        { status: 409 },
      );

    /* Once an invoice exists the trade is on the billing path, and its receipt
       is issued from the invoice after payment. Allowing a second, quote-sourced
       receipt here would recognise the same money as income twice. */
    const invoice = await (await invoicesCollection()).findOne({ organizationId, sourceQuoteId: id });
    if (invoice)
      return Response.json(
        {
          invoice: { id: invoice._id.toHexString(), invoiceNumber: invoice.invoiceNumber },
          message: `此報價單已建立請款單 ${invoice.invoiceNumber}，收據請在款項收妥後於請款單開立。`,
        },
        { status: 409 },
      );

    const [receiptNumber] = await nextReceiptNumbers(organizationId, [{ issueDate: new Date().toISOString().slice(0, 10) }]);
    const now = new Date();
    const receipt: ReceiptDocument = {
      amount: quote.totalAmount,
      businessRegistration: quote.companySnapshot.businessRegistration,
      createdAt: now,
      createdBy: userId,
      description: quote.lines.map((line) => line.name).join("；").slice(0, 2000) || "報價單項目",
      issueDate: now.toISOString().slice(0, 10),
      issuerAddress: quote.companySnapshot.address,
      issuerContact: [quote.companySnapshot.phone, quote.companySnapshot.email].filter(Boolean).join(" · "),
      issuerName: quote.companySnapshot.name,
      lineItems: quote.lines,
      notes: [quote.notes, `來源報價單：${quote.quoteNumber}`].filter(Boolean).join("\n"),
      organizationId,
      payerAddress: quote.customerSnapshot.address,
      payerName: quote.customerSnapshot.name,
      paymentMethod: "待收款",
      paymentStatus: "pending",
      receiptNumber,
      receiptTemplateSnapshot: { ...user.organization.receiptTemplate },
      sourceQuoteId: id,
      sourceQuoteNumber: quote.quoteNumber,
      updatedAt: now,
    };

    try {
      const result = await receipts.insertOne(receipt);
      await (await quotesCollection()).updateOne({ _id: id, organizationId }, { $set: { receiptId: result.insertedId, updatedAt: now } });
      return Response.json({ receipt: { id: result.insertedId.toHexString(), paymentStatus: "pending", receiptNumber } }, { status: 201 });
    } catch (error) {
      if (!(typeof error === "object" && error && "code" in error && error.code === 11000)) throw error;
      const duplicate = await receipts.findOne({ organizationId, sourceQuoteId: id });
      if (!duplicate) throw error;
      await (await quotesCollection()).updateOne({ _id: id, organizationId }, { $set: { receiptId: duplicate._id, updatedAt: new Date() } });
      return Response.json(
        { message: "此報價單已經建立收據。", receipt: { id: duplicate._id.toHexString(), receiptNumber: duplicate.receiptNumber } },
        { status: 409 },
      );
    }
  } catch {
    return Response.json({ message: "無法建立收據草稿。" }, { status: 503 });
  }
}
