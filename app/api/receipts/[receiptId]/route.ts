import { ObjectId } from "mongodb";
import { z } from "zod";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";
import { receiptsCollection } from "@/lib/receipt-store";

export const runtime = "nodejs";

const updateSchema = z.object({ paymentStatus: z.literal("paid") }).strict();

export async function PUT(request: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "只可確認收據為已收款。" }, { status: 400 });
  const { receiptId } = await params;
  if (!ObjectId.isValid(receiptId)) return Response.json({ message: "收據不存在。" }, { status: 404 });

  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user)) return Response.json({ message: "你的角色只有檢視權限，無法確認收款。" }, { status: 403 });
    if (!await canUseWorkspaceFeature(user, "receipts")) return Response.json({ message: "此工作區目前無法使用收據功能。" }, { status: 403 });
    const result = await (await receiptsCollection()).updateOne(
      { _id: new ObjectId(receiptId), organizationId: new ObjectId(user.organization.id), createdBy: new ObjectId(user.id) },
      { $set: { paymentStatus: "paid", updatedAt: new Date() } },
    );
    if (!result.matchedCount) return Response.json({ message: "收據不存在。" }, { status: 404 });
    // The ledger treats paid receipts as its receipt-backed, idempotent income
    // source. Repeating this request only updates the same receipt document.
    return Response.json({ paymentStatus: "paid" });
  } catch {
    return Response.json({ message: "無法確認收款。" }, { status: 503 });
  }
}
