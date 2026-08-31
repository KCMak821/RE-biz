import { ObjectId } from "mongodb";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import {
  customersCollection,
  type CustomerDocument,
} from "@/lib/customer-store";
import { customerFieldsSchema, quoteEffectiveStatus } from "@/lib/quotation";
import { quotesCollection } from "@/lib/quote-store";
import { z } from "zod";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";

export const runtime = "nodejs";

async function context(params: Promise<{ customerId: string }>) {
  const { customerId } = await params;
  return ObjectId.isValid(customerId) ? new ObjectId(customerId) : null;
}

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
const statusSchema = z
  .object({ status: z.enum(["active", "archived"]) })
  .strict();

export async function GET(
  _: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const id = await context(params);
  if (!id) return Response.json({ message: "客戶不存在。" }, { status: 404 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!(await canUseWorkspaceFeature(user, "quotations")))
      return Response.json(
        { message: "此工作區目前無法使用報價單功能。" },
        { status: 403 },
      );
    const customer = await (
      await customersCollection()
    ).findOne({ _id: id, organizationId: new ObjectId(user.organization.id) });
    if (!customer)
      return Response.json({ message: "客戶不存在。" }, { status: 404 });
    const quotations = await (
      await quotesCollection()
    )
      .find(
        {
          organizationId: new ObjectId(user.organization.id),
          customerId: id,
          createdBy: new ObjectId(user.id),
        },
        {
          projection: {
            issueDate: 1,
            quoteNumber: 1,
            status: 1,
            totalAmount: 1,
            updatedAt: 1,
            validUntil: 1,
          },
        },
      )
      .sort({ issueDate: -1, updatedAt: -1 })
      .limit(200)
      .toArray();
    return Response.json({
      customer: serialize(customer),
      quotations: quotations.map((quote) => ({
        id: quote._id.toHexString(),
        issueDate: quote.issueDate,
        quoteNumber: quote.quoteNumber,
        status: quoteEffectiveStatus(quote.status, quote.validUntil),
        totalAmount: quote.totalAmount,
        updatedAt: quote.updatedAt.toISOString(),
      })),
    });
  } catch {
    return Response.json({ message: "無法讀取客戶。" }, { status: 503 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const id = await context(params);
  const parsed = customerFieldsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!id || !parsed.success)
    return Response.json({ message: "客戶資料格式不正確。" }, { status: 400 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user))
      return Response.json(
        { message: "你的角色只有檢視權限，無法更新客戶。" },
        { status: 403 },
      );
    if (!(await canUseWorkspaceFeature(user, "quotations")))
      return Response.json(
        { message: "此工作區目前無法使用報價單功能。" },
        { status: 403 },
      );
    const collection = await customersCollection();
    const result = await collection.findOneAndUpdate(
      { _id: id, organizationId: new ObjectId(user.organization.id) },
      { $set: { ...parsed.data, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    return result
      ? Response.json({ customer: serialize(result) })
      : Response.json({ message: "客戶不存在。" }, { status: 404 });
  } catch {
    return Response.json({ message: "無法更新客戶。" }, { status: 503 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const id = await context(params);
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!id || !parsed.success)
    return Response.json({ message: "客戶狀態格式不正確。" }, { status: 400 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user))
      return Response.json(
        { message: "你的角色只有檢視權限，無法更新客戶狀態。" },
        { status: 403 },
      );
    if (!(await canUseWorkspaceFeature(user, "quotations")))
      return Response.json(
        { message: "此工作區目前無法使用報價單功能。" },
        { status: 403 },
      );
    const result = await (
      await customersCollection()
    ).findOneAndUpdate(
      { _id: id, organizationId: new ObjectId(user.organization.id) },
      { $set: { status: parsed.data.status, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    return result
      ? Response.json({ customer: serialize(result) })
      : Response.json({ message: "客戶不存在。" }, { status: 404 });
  } catch {
    return Response.json({ message: "無法更新客戶狀態。" }, { status: 503 });
  }
}
