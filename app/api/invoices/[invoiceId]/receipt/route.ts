import { ObjectId } from "mongodb";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { invoiceEffectiveStatus } from "@/lib/invoice";
import { invoiceReceiptFields, invoicesCollection } from "@/lib/invoice-store";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";
import { quotesCollection } from "@/lib/quote-store";
import { nextReceiptNumbers, receiptsCollection, type ReceiptDocument } from "@/lib/receipt-store";

export const runtime = "nodejs";

/** The one thing standing between a paid invoice and its receipt, per state. */
function refusal(status: ReturnType<typeof invoiceEffectiveStatus>) {
  switch (status) {
    case "paid":
      return null;
    case "draft":
      return "草稿請款單還沒發送給客戶，不能開立收據。";
    case "void":
      return "已作廢的請款單不能開立收據。";
    case "partially_paid":
      return "這張請款單只收到部分款項，收足全額後才能開立收據。";
    default:
      return "這張請款單尚未收款，登記收款後才能開立收據。";
  }
}

/**
 * Issues the receipt for a fully paid invoice.
 *
 * A receipt is where RE-Biz recognises income, so exactly one may exist per
 * trade. That is enforced in the database, not here: the receipt carries both
 * `sourceInvoiceId` and — when the invoice grew out of a quote — the quote's
 * id, and each has a partial unique index. Two concurrent requests, or a
 * belated attempt to receipt the quote directly, therefore collide on an index
 * rather than quietly doubling the workspace's income.
 */
export async function POST(_: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  if (!ObjectId.isValid(invoiceId)) return Response.json({ message: "請款單不存在。" }, { status: 404 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user)) return Response.json({ message: "你的角色只有檢視權限，無法開立收據。" }, { status: 403 });
    if (!(await canUseWorkspaceFeature(user, "invoices")) || !(await canUseWorkspaceFeature(user, "receipts")))
      return Response.json({ message: "此工作區目前無法由請款單開立收據。" }, { status: 403 });

    const organizationId = new ObjectId(user.organization.id);
    const id = new ObjectId(invoiceId);
    const invoice = await (await invoicesCollection()).findOne({ _id: id, organizationId });
    if (!invoice) return Response.json({ message: "請款單不存在。" }, { status: 404 });

    const blocked = refusal(invoiceEffectiveStatus(invoice.status, invoice.paymentStatus, invoice.dueDate));
    if (blocked) return Response.json({ message: blocked }, { status: 409 });

    const receipts = await receiptsCollection();
    const existing = await receipts.findOne({ organizationId, sourceInvoiceId: id });
    if (existing)
      return Response.json(
        { message: "此請款單已開立收據。", receipt: { id: existing._id.toHexString(), receiptNumber: existing.receiptNumber } },
        { status: 409 },
      );

    const fields = invoiceReceiptFields({ ...invoice, _id: id });
    const [receiptNumber] = await nextReceiptNumbers(organizationId, [{ issueDate: fields.issueDate }]);
    const now = new Date();
    const receipt: ReceiptDocument = {
      ...fields,
      createdAt: now,
      createdBy: new ObjectId(user.id),
      organizationId,
      // The money is already in, so this receipt is income from the moment it
      // exists; there is nothing left to confirm.
      paymentStatus: "paid",
      receiptNumber,
      receiptTemplateSnapshot: { ...user.organization.receiptTemplate },
      // Carried through so the quote can never also be receipted directly.
      sourceQuoteId: invoice.sourceQuoteId,
      sourceQuoteNumber: invoice.sourceQuoteNumber,
      updatedAt: now,
    };

    try {
      const result = await receipts.insertOne(receipt);
      if (invoice.sourceQuoteId)
        await (await quotesCollection()).updateOne(
          { _id: invoice.sourceQuoteId, organizationId },
          { $set: { receiptId: result.insertedId, updatedAt: now } },
        );
      return Response.json(
        { receipt: { id: result.insertedId.toHexString(), paymentStatus: "paid", receiptNumber } },
        { status: 201 },
      );
    } catch (error) {
      if (!(typeof error === "object" && error && "code" in error && error.code === 11000)) throw error;
      const duplicate = await receipts.findOne({
        organizationId,
        $or: [{ sourceInvoiceId: id }, ...(invoice.sourceQuoteId ? [{ sourceQuoteId: invoice.sourceQuoteId }] : [])],
      });
      if (!duplicate) throw error;
      return Response.json(
        {
          message: duplicate.sourceInvoiceId ? "此請款單已開立收據。" : "來源報價單已建立收據，同一筆交易不可重複開立。",
          receipt: { id: duplicate._id.toHexString(), receiptNumber: duplicate.receiptNumber },
        },
        { status: 409 },
      );
    }
  } catch {
    return Response.json({ message: "無法開立收據。" }, { status: 503 });
  }
}
