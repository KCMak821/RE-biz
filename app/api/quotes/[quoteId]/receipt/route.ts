import { ObjectId } from "mongodb";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { quoteEffectiveStatus } from "@/lib/quotation";
import { quotesCollection } from "@/app/api/quotes/route";
import { nextReceiptNumbers, receiptsCollection, type ReceiptDocument } from "@/lib/receipt-store";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params; if (!ObjectId.isValid(quoteId)) return Response.json({ message: "報價單不存在。" }, { status: 404 });
  try {
    const user = await getCurrentUser(); if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user)) return Response.json({ message: "你的角色只有檢視權限，無法建立收據草稿。" }, { status: 403 });
    const organizationId = new ObjectId(user.organization.id); const userId = new ObjectId(user.id); const id = new ObjectId(quoteId);
    const quote = await (await quotesCollection()).findOne({ _id: id, organizationId, createdBy: userId });
    if (!quote) return Response.json({ message: "報價單不存在。" }, { status: 404 });
    if (quoteEffectiveStatus(quote.status, quote.validUntil) !== "accepted") return Response.json({ message: "只有已接受且未失效的報價單可建立收據草稿。" }, { status: 409 });
    const receipts = await receiptsCollection();
    const existing = await receipts.findOne({ sourceQuoteId: id, organizationId, createdBy: userId });
    if (existing) return Response.json({ message: "此報價單已建立收據草稿。", receipt: { id: existing._id.toHexString(), receiptNumber: existing.receiptNumber } }, { status: 409 });
    const [receiptNumber] = await nextReceiptNumbers(organizationId, [{ issueDate: new Date().toISOString().slice(0, 10) }]);
    const now = new Date();
    const receipt: ReceiptDocument = {
      amount: quote.totalAmount, businessRegistration: quote.companySnapshot.businessRegistration, createdAt: now, createdBy: userId,
      description: quote.lines.map((line) => line.name).join("；").slice(0, 2000) || "報價單項目",
      issueDate: now.toISOString().slice(0, 10), issuerAddress: quote.companySnapshot.address,
      issuerContact: [quote.companySnapshot.phone, quote.companySnapshot.email].filter(Boolean).join(" · "), issuerName: quote.companySnapshot.name,
      lineItems: quote.lines, notes: [quote.notes, `來源報價單：${quote.quoteNumber}`].filter(Boolean).join("\n"), organizationId,
      payerAddress: quote.customerSnapshot.address, payerName: quote.customerSnapshot.name, paymentMethod: "待收款", paymentStatus: "pending",
      receiptNumber, sourceQuoteId: id, sourceQuoteNumber: quote.quoteNumber, updatedAt: now,
    };
    try {
      const result = await receipts.insertOne(receipt);
      await (await quotesCollection()).updateOne({ _id: id, organizationId, createdBy: userId }, { $set: { receiptId: result.insertedId, updatedAt: now } });
      return Response.json({ receipt: { id: result.insertedId.toHexString(), paymentStatus: "pending", receiptNumber } }, { status: 201 });
    } catch (error) {
      if (!(typeof error === "object" && error && "code" in error && error.code === 11000)) throw error;
      const duplicate = await receipts.findOne({ sourceQuoteId: id, organizationId, createdBy: userId });
      if (duplicate) {
        await (await quotesCollection()).updateOne({ _id: id, organizationId, createdBy: userId }, { $set: { receiptId: duplicate._id, updatedAt: new Date() } });
        return Response.json({ message: "此報價單已建立收據草稿。", receipt: { id: duplicate._id.toHexString(), receiptNumber: duplicate.receiptNumber } }, { status: 409 });
      }
      throw error;
    }
  } catch {
    return Response.json({ message: "無法建立收據草稿。" }, { status: 503 });
  }
}
