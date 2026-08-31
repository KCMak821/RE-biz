import { ObjectId } from "mongodb";
import { z } from "zod";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { receiptCreateSchema } from "@/lib/receipt";
import { createReceiptDocuments, receiptsCollection } from "@/lib/receipt-store";

export const runtime = "nodejs";

const batchSchema = z.object({ receipts: z.array(receiptCreateSchema).min(1).max(100) }).strict();

async function requireUser() {
  const user = await getCurrentUser();
  return user;
}

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });

    const collection = await receiptsCollection();
    const organizationId = new ObjectId(user.organization.id);
    const receipts = await collection
      .find({ organizationId: new ObjectId(user.organization.id), createdBy: new ObjectId(user.id) })
      .sort({ issueDate: -1, createdAt: -1 })
      .limit(20)
      .toArray();
    const descriptionSuggestions = await collection.aggregate<{ _id: string }>([
      { $match: { organizationId, createdBy: new ObjectId(user.id), description: { $ne: "" } } },
      { $group: { _id: "$description", latestCreatedAt: { $max: "$createdAt" } } },
      { $sort: { latestCreatedAt: -1 } },
      { $limit: 12 },
    ]).toArray();
    return Response.json({
      descriptionSuggestions: descriptionSuggestions.map(({ _id }) => _id),
      receipts: receipts.map(({ _id, amount, createdAt, issueDate, payerName, paymentStatus, receiptNumber, sourceQuoteId, sourceQuoteNumber }) => ({
        amount,
        createdAt: createdAt.toISOString(),
        id: _id.toHexString(),
        issueDate,
        payerName,
        paymentStatus,
        receiptNumber,
        sourceQuoteId: sourceQuoteId?.toHexString(),
        sourceQuoteNumber,
      })),
    });
  } catch {
    return Response.json({ message: "無法讀取收據資料。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const parsed = batchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "收據資料不完整或格式不正確。" }, { status: 400 });

  try {
    const user = await requireUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user)) return Response.json({ message: "你的角色只有檢視權限，無法儲存收據。" }, { status: 403 });

    const organizationId = new ObjectId(user.organization.id);
    const result = await createReceiptDocuments({ createdBy: new ObjectId(user.id), organizationId, receipts: parsed.data.receipts });
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000) {
      return Response.json({ message: "系統派號發生衝突，請重新生成收據。" }, { status: 409 });
    }
    return Response.json({ message: "無法儲存收據資料。" }, { status: 503 });
  }
}
