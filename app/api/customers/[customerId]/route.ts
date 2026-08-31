import { ObjectId } from "mongodb";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { customersCollection, type CustomerDocument } from "@/app/api/customers/route";
import { customerFieldsSchema } from "@/lib/quotation";

export const runtime = "nodejs";

async function context(params: Promise<{ customerId: string }>) {
  const { customerId } = await params;
  return ObjectId.isValid(customerId) ? new ObjectId(customerId) : null;
}

function serialize(document: CustomerDocument & { _id: ObjectId }) {
  return { ...document, createdAt: document.createdAt.toISOString(), id: document._id.toHexString(), updatedAt: document.updatedAt.toISOString(), _id: undefined, createdBy: undefined, organizationId: undefined };
}

export async function GET(_: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const id = await context(params);
  if (!id) return Response.json({ message: "客戶不存在。" }, { status: 404 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    const customer = await (await customersCollection()).findOne({ _id: id, organizationId: new ObjectId(user.organization.id), createdBy: new ObjectId(user.id) });
    return customer ? Response.json({ customer: serialize(customer) }) : Response.json({ message: "客戶不存在。" }, { status: 404 });
  } catch { return Response.json({ message: "無法讀取客戶。" }, { status: 503 }); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const id = await context(params);
  const parsed = customerFieldsSchema.safeParse(await request.json().catch(() => null));
  if (!id || !parsed.success) return Response.json({ message: "客戶資料格式不正確。" }, { status: 400 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user)) return Response.json({ message: "你的角色只有檢視權限，無法更新客戶。" }, { status: 403 });
    const collection = await customersCollection();
    const result = await collection.findOneAndUpdate({ _id: id, organizationId: new ObjectId(user.organization.id), createdBy: new ObjectId(user.id) }, { $set: { ...parsed.data, updatedAt: new Date() } }, { returnDocument: "after" });
    return result ? Response.json({ customer: serialize(result) }) : Response.json({ message: "客戶不存在。" }, { status: 404 });
  } catch { return Response.json({ message: "無法更新客戶。" }, { status: 503 }); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const id = await context(params);
  if (!id) return Response.json({ message: "客戶不存在。" }, { status: 404 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user)) return Response.json({ message: "你的角色只有檢視權限，無法刪除客戶。" }, { status: 403 });
    const result = await (await customersCollection()).deleteOne({ _id: id, organizationId: new ObjectId(user.organization.id), createdBy: new ObjectId(user.id) });
    return result.deletedCount ? Response.json({ ok: true }) : Response.json({ message: "客戶不存在。" }, { status: 404 });
  } catch { return Response.json({ message: "無法刪除客戶。" }, { status: 503 }); }
}
