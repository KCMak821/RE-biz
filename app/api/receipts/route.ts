import { ObjectId } from "mongodb";
import { z } from "zod";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";
import { keywordRegex, readKeyword, readPageParams, resolvePage } from "@/lib/query";
import { receiptCreateSchema } from "@/lib/receipt";
import { createReceiptDocuments, receiptsCollection, serializeReceipt } from "@/lib/receipt-store";

export const runtime = "nodejs";

const batchSchema = z.object({ receipts: z.array(receiptCreateSchema).min(1).max(100) }).strict();
const receiptStatuses = ["all", "pending", "paid"] as const;

async function requireUser() {
  const user = await getCurrentUser();
  return user;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!await canUseWorkspaceFeature(user, "receipts")) return Response.json({ message: "此工作區目前無法使用收據功能。" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "all";
    if (!(receiptStatuses as readonly string[]).includes(status)) {
      return Response.json({ message: "收款狀態篩選不正確。" }, { status: 400 });
    }
    const keyword = readKeyword(searchParams);
    const { page: requestedPage, pageSize } = readPageParams(searchParams);

    const collection = await receiptsCollection();
    const organizationId = new ObjectId(user.organization.id);
    // Receipts belong to the workspace, so every member of the organization
    // reads the same list. The stored createdBy is audit trail only and never
    // narrows what a member can see.
    const baseFilter = { organizationId };
    const filter: Record<string, unknown> = { ...baseFilter };
    // Receipts saved before paymentStatus existed are treated as paid.
    if (status === "pending") filter.paymentStatus = "pending";
    else if (status === "paid") filter.paymentStatus = { $ne: "pending" };
    if (keyword) {
      const expression = keywordRegex(keyword);
      filter.$or = [{ receiptNumber: expression }, { payerName: expression }, { description: expression }];
    }

    const total = await collection.countDocuments(filter);
    const { page, skip, totalPages } = resolvePage({ page: requestedPage, pageSize, total });
    const receipts = await collection
      .find(filter)
      .sort({ issueDate: -1, createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(pageSize)
      .toArray();

    const descriptionSuggestions = await collection.aggregate<{ _id: string }>([
      { $match: { ...baseFilter, description: { $ne: "" } } },
      { $group: { _id: "$description", latestCreatedAt: { $max: "$createdAt" } } },
      { $sort: { latestCreatedAt: -1 } },
      { $limit: 12 },
    ]).toArray();

    return Response.json({
      descriptionSuggestions: descriptionSuggestions.map(({ _id }) => _id),
      page,
      pageSize,
      receipts: receipts.map(serializeReceipt),
      total,
      totalPages,
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
    if (!await canUseWorkspaceFeature(user, "receipts")) return Response.json({ message: "此工作區目前無法使用收據功能。" }, { status: 403 });

    const organizationId = new ObjectId(user.organization.id);
    const result = await createReceiptDocuments({
      createdBy: new ObjectId(user.id),
      organizationId,
      receipts: parsed.data.receipts,
      receiptTemplate: user.organization.receiptTemplate,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000) {
      return Response.json({ message: "系統派號發生衝突，請重新生成收據。" }, { status: 409 });
    }
    return Response.json({ message: "無法儲存收據資料。" }, { status: 503 });
  }
}
