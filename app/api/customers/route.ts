import { ObjectId } from "mongodb";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import {
  customersCollection,
  type CustomerDocument,
} from "@/lib/customer-store";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";
import { customerFieldsSchema } from "@/lib/quotation";

export const runtime = "nodejs";

function serialize(document: CustomerDocument & { _id: ObjectId }) {
  return {
    ...document,
    createdAt: document.createdAt.toISOString(),
    id: document._id.toHexString(),
    status: document.status ?? "active",
    updatedAt: document.updatedAt.toISOString(),
    _id: undefined,
    createdBy: undefined,
    organizationId: undefined,
  };
}

function escapedRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!(await canUseWorkspaceFeature(user, "quotations")))
      return Response.json(
        { message: "此工作區目前無法使用報價單功能。" },
        { status: 403 },
      );
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "active";
    const keyword = searchParams.get("q")?.trim().slice(0, 100) ?? "";
    if (!["active", "archived", "all"].includes(status))
      return Response.json(
        { message: "客戶狀態篩選不正確。" },
        { status: 400 },
      );
    const clauses: Record<string, unknown>[] = [
      { organizationId: new ObjectId(user.organization.id) },
    ];
    if (status === "active")
      clauses.push({
        $or: [{ status: "active" }, { status: { $exists: false } }],
      });
    else if (status === "archived") clauses.push({ status: "archived" });
    if (keyword) {
      const expression = new RegExp(escapedRegex(keyword), "i");
      const fields = [
        { name: expression },
        { companyName: expression },
        { contact: expression },
        { email: expression },
        { phone: expression },
        { businessRegistration: expression },
      ];
      clauses.push({ $or: fields });
    }
    const filter = clauses.length === 1 ? clauses[0] : { $and: clauses };
    const customers = await (
      await customersCollection()
    )
      .find(filter)
      .sort({ name: 1 })
      .limit(500)
      .toArray();
    return Response.json({ customers: customers.map(serialize) });
  } catch {
    return Response.json({ message: "無法讀取客戶資料。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const parsed = customerFieldsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json({ message: "客戶資料格式不正確。" }, { status: 400 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user))
      return Response.json(
        { message: "你的角色只有檢視權限，無法新增客戶。" },
        { status: 403 },
      );
    if (!(await canUseWorkspaceFeature(user, "quotations")))
      return Response.json(
        { message: "此工作區目前無法使用報價單功能。" },
        { status: 403 },
      );
    const now = new Date();
    const result = await (
      await customersCollection()
    ).insertOne({
      ...parsed.data,
      createdAt: now,
      createdBy: new ObjectId(user.id),
      organizationId: new ObjectId(user.organization.id),
      status: "active",
      updatedAt: now,
    });
    const customer = await (
      await customersCollection()
    ).findOne({
      _id: result.insertedId,
      organizationId: new ObjectId(user.organization.id),
    });
    return Response.json(
      { customer: customer ? serialize(customer) : null },
      { status: 201 },
    );
  } catch {
    return Response.json({ message: "無法新增客戶。" }, { status: 503 });
  }
}
