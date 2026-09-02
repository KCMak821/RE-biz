import { ObjectId } from "mongodb";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";
import { nextQuoteNumber, quotesCollection, type QuoteDocument } from "@/lib/quote-store";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params; if (!ObjectId.isValid(quoteId)) return Response.json({ message: "報價單不存在。" }, { status: 404 });
  try {
    const user = await getCurrentUser(); if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user)) return Response.json({ message: "你的角色只有檢視權限，無法複製報價單。" }, { status: 403 });
    if (!await canUseWorkspaceFeature(user, "quotations")) return Response.json({ message: "此工作區目前無法使用報價單功能。" }, { status: 403 });
    const collection = await quotesCollection(); const userId = new ObjectId(user.id); const organizationId = new ObjectId(user.organization.id); const now = new Date();
    const source = await collection.findOne({ _id: new ObjectId(quoteId), organizationId });
    if (!source) return Response.json({ message: "報價單不存在。" }, { status: 404 });
    const issueDate = now.toISOString().slice(0, 10);
    const validUntilDate = new Date(`${issueDate}T00:00:00`);
    validUntilDate.setDate(validUntilDate.getDate() + 30);
    const copy: QuoteDocument = {
      // The copy is a new quote, so its audit trail names whoever duplicated it.
      companySnapshot: source.companySnapshot, createdAt: now, createdBy: userId, currency: "HKD", customerId: source.customerId,
      customerSnapshot: source.customerSnapshot, issueDate, lines: source.lines, notes: source.notes, organizationId: source.organizationId,
      quoteNumber: await nextQuoteNumber(organizationId, issueDate), status: "draft", terms: source.terms, totalAmount: source.totalAmount,
      totalDiscount: source.totalDiscount, updatedAt: now, validUntil: validUntilDate.toISOString().slice(0, 10),
    };
    const result = await collection.insertOne(copy);
    return Response.json({ id: result.insertedId.toHexString(), quoteNumber: copy.quoteNumber }, { status: 201 });
  } catch { return Response.json({ message: "無法複製報價單。" }, { status: 503 }); }
}
