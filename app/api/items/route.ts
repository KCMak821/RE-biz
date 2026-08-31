import { ObjectId } from "mongodb";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { itemFieldsSchema, type ItemFields } from "@/lib/quotation";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";

export const runtime = "nodejs";

export type ItemDocument = ItemFields & { createdAt: Date; createdBy: ObjectId; organizationId: ObjectId; updatedAt: Date };

export async function itemsCollection() {
  const collection = (await getDatabase()).collection<ItemDocument>("items");
  await Promise.all([
    collection.createIndex({ organizationId: 1, createdBy: 1, isActive: 1, name: 1 }),
    collection.createIndex({ organizationId: 1, createdBy: 1, updatedAt: -1 }),
  ]);
  return collection;
}

function serialize(document: ItemDocument & { _id: ObjectId }) {
  return { ...document, createdAt: document.createdAt.toISOString(), id: document._id.toHexString(), updatedAt: document.updatedAt.toISOString(), _id: undefined, createdBy: undefined, organizationId: undefined };
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!await canUseWorkspaceFeature(user, "quotations")) return Response.json({ message: "此工作區目前無法使用報價單功能。" }, { status: 403 });
    const items = await (await itemsCollection()).find({ organizationId: new ObjectId(user.organization.id), createdBy: new ObjectId(user.id) }).sort({ isActive: -1, name: 1 }).limit(500).toArray();
    return Response.json({ items: items.map(serialize) });
  } catch { return Response.json({ message: "無法讀取常用品項。" }, { status: 503 }); }
}

export async function POST(request: Request) {
  const parsed = itemFieldsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "品項資料格式不正確。" }, { status: 400 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user)) return Response.json({ message: "你的角色只有檢視權限，無法新增品項。" }, { status: 403 });
    if (!await canUseWorkspaceFeature(user, "quotations")) return Response.json({ message: "此工作區目前無法使用報價單功能。" }, { status: 403 });
    const now = new Date(); const collection = await itemsCollection();
    const result = await collection.insertOne({ ...parsed.data, createdAt: now, createdBy: new ObjectId(user.id), organizationId: new ObjectId(user.organization.id), updatedAt: now });
    const item = await collection.findOne({ _id: result.insertedId, createdBy: new ObjectId(user.id) });
    return Response.json({ item: item ? serialize(item) : null }, { status: 201 });
  } catch { return Response.json({ message: "無法新增品項。" }, { status: 503 }); }
}
