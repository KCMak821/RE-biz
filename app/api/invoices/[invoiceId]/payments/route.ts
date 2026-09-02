import { ObjectId } from "mongodb";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { currencyAmount } from "@/lib/format";
import { invoicePaymentSchema, invoicePaymentStatusFor } from "@/lib/invoice";
import { invoicePaidAmount, invoicesCollection, serializeInvoice, type InvoicePaymentDocument } from "@/lib/invoice-store";
import { amountToCents } from "@/lib/money";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";

export const runtime = "nodejs";

/**
 * Records one receipt of money against a sent invoice. The payment status is
 * always derived from the sum of these records, so it cannot drift out of step
 * with the money actually collected.
 */
export async function POST(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const parsed = invoicePaymentSchema.safeParse(await request.json().catch(() => null));
  if (!ObjectId.isValid(invoiceId)) return Response.json({ message: "請款單不存在。" }, { status: 404 });
  if (!parsed.success) return Response.json({ message: "請填寫大於 0 的收款金額與收款日期。" }, { status: 400 });

  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user)) return Response.json({ message: "你的角色只有檢視權限，無法登記收款。" }, { status: 403 });
    if (!await canUseWorkspaceFeature(user, "invoices")) return Response.json({ message: "此工作區目前無法使用請款單功能。" }, { status: 403 });

    const collection = await invoicesCollection();
    // Scoped to the workspace, not to the invoice's creator: any member with
    // record permission may register a payment on a colleague's invoice.
    const inWorkspace = {
      _id: new ObjectId(invoiceId),
      organizationId: new ObjectId(user.organization.id),
    };
    const invoice = await collection.findOne(inWorkspace);
    if (!invoice) return Response.json({ message: "請款單不存在。" }, { status: 404 });
    if (invoice.status === "draft") return Response.json({ message: "草稿請款單還沒發送給客戶，請先標示為已發送再登記收款。" }, { status: 409 });
    if (invoice.status === "void") return Response.json({ message: "已作廢的請款單不可登記收款。" }, { status: 409 });

    const alreadyPaid = invoicePaidAmount(invoice);
    const outstandingCents = amountToCents(invoice.totalAmount) - amountToCents(alreadyPaid);
    if (outstandingCents <= 0) return Response.json({ message: "已付款的請款單不能再登記收款。" }, { status: 409 });
    if (amountToCents(parsed.data.amount) > outstandingCents) {
      const outstanding = currencyAmount(invoice.currency, invoice.totalAmount - alreadyPaid);
      return Response.json({ message: `收款金額不可高於尚欠金額 ${outstanding}。` }, { status: 409 });
    }

    const now = new Date();
    const payment: InvoicePaymentDocument = {
      _id: new ObjectId(),
      amount: parsed.data.amount,
      createdAt: now,
      createdBy: new ObjectId(user.id),
      createdByName: user.name,
      note: parsed.data.note,
      paidAt: parsed.data.paidAt,
    };
    const paymentStatus = invoicePaymentStatusFor(alreadyPaid + parsed.data.amount, invoice.totalAmount);

    /* The overpayment check above was made against a snapshot, so the write is
       guarded on that exact snapshot: the invoice must still be in the same
       status and still hold precisely the payments that were counted. Two
       concurrent instalments therefore cannot both be applied — the loser is
       told to reload and re-check what is still outstanding. `$size` is exact,
       so this holds even when both instalments would individually fit. */
    const recorded = (invoice.payments ?? []).length;
    const unchanged = recorded === 0
      ? { $or: [{ payments: { $exists: false } }, { payments: { $size: 0 } }] }
      : { payments: { $size: recorded } };
    const result = await collection.findOneAndUpdate(
      { ...inWorkspace, ...unchanged, status: invoice.status },
      { $push: { payments: payment }, $set: { paymentStatus, updatedAt: now } },
      { returnDocument: "after" },
    );
    if (!result) return Response.json({ message: "請款單已被更新，請重新整理後再登記收款。" }, { status: 409 });

    return Response.json({ invoice: serializeInvoice(result) }, { status: 201 });
  } catch {
    return Response.json({ message: "無法登記收款。" }, { status: 503 });
  }
}
