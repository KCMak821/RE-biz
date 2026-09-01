import { ObjectId } from "mongodb";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { itemsCollection, serializeItem } from "@/lib/item-store";
import { itemFieldsSchema } from "@/lib/quotation";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";

export const runtime = "nodejs";

async function context(params: Promise<{ itemId: string }>) { const { itemId } = await params; return ObjectId.isValid(itemId) ? new ObjectId(itemId) : null; }

export async function PUT(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const id = await context(params); const parsed = itemFieldsSchema.safeParse(await request.json().catch(() => null));
  if (!id || !parsed.success) return Response.json({ message: "品項資料格式不正確。" }, { status: 400 });
  try {
    const user = await getCurrentUser(); if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user)) return Response.json({ message: "你的角色只有檢視權限，無法更新品項。" }, { status: 403 });
    if (!await canUseWorkspaceFeature(user, "quotations")) return Response.json({ message: "此工作區目前無法使用報價單功能。" }, { status: 403 });
    const result = await (await itemsCollection()).findOneAndUpdate({ _id: id, organizationId: new ObjectId(user.organization.id), createdBy: new ObjectId(user.id) }, { $set: { ...parsed.data, updatedAt: new Date() } }, { returnDocument: "after" });
    return result ? Response.json({ item: serializeItem(result) }) : Response.json({ message: "品項不存在。" }, { status: 404 });
  } catch { return Response.json({ message: "無法更新品項。" }, { status: 503 }); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const id = await context(params); if (!id) return Response.json({ message: "品項不存在。" }, { status: 404 });
  try {
    const user = await getCurrentUser(); if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user)) return Response.json({ message: "你的角色只有檢視權限，無法刪除品項。" }, { status: 403 });
    if (!await canUseWorkspaceFeature(user, "quotations")) return Response.json({ message: "此工作區目前無法使用報價單功能。" }, { status: 403 });
    const result = await (await itemsCollection()).deleteOne({ _id: id, organizationId: new ObjectId(user.organization.id), createdBy: new ObjectId(user.id) });
    return result.deletedCount ? Response.json({ ok: true }) : Response.json({ message: "品項不存在。" }, { status: 404 });
  } catch { return Response.json({ message: "無法刪除品項。" }, { status: 503 }); }
}
