import { ObjectId } from "mongodb";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";
import { ledgerEntrySchema, type LedgerEntryInput } from "@/lib/ledger";
import { getDatabase } from "@/lib/mongodb";

export const runtime = "nodejs";

type LedgerEntryDocument = LedgerEntryInput & {
  createdAt: Date;
  createdBy: ObjectId;
  organizationId: ObjectId;
};

type ReceiptIncomeDocument = {
  _id: ObjectId;
  amount: number;
  createdAt: Date;
  issueDate: string;
  organizationId: ObjectId;
  paymentStatus?: "pending" | "paid";
  payerName: string;
  receiptNumber: string;
};

async function ledgerCollection() {
  const collection = (await getDatabase()).collection<LedgerEntryDocument>("ledgerEntries");
  await collection.createIndex({ organizationId: 1, date: -1, createdAt: -1 });
  return collection;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!await canUseWorkspaceFeature(user, "accounting")) return Response.json({ message: "此工作區目前無法使用記帳功能。" }, { status: 403 });

    const organizationId = new ObjectId(user.organization.id);
    const userId = new ObjectId(user.id);
    const database = await getDatabase();
    const collection = await ledgerCollection();
    const receipts = database.collection<ReceiptIncomeDocument>("receipts");
    const [manualEntries, totals, receiptEntries, receiptTotal] = await Promise.all([
      collection.find({ organizationId, createdBy: userId }).sort({ date: -1, createdAt: -1 }).limit(100).toArray(),
      collection.aggregate<{ _id: "IN" | "OUT"; total: number }>([
      { $match: { organizationId, createdBy: userId } },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
      ]).toArray(),
      // Older ordinary receipts did not have a paymentStatus and remain paid
      // for backwards compatibility. Quote-created drafts are explicitly
      // pending, so they never become income until confirmation.
      receipts.find({ organizationId, createdBy: userId, paymentStatus: { $ne: "pending" } }).sort({ issueDate: -1, createdAt: -1 }).limit(100).toArray(),
      receipts.aggregate<{ total: number }>([
        { $match: { organizationId, createdBy: userId, paymentStatus: { $ne: "pending" } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]).toArray(),
    ]);
    const manualIncome = totals.find((total) => total._id === "IN")?.total ?? 0;
    const expense = totals.find((total) => total._id === "OUT")?.total ?? 0;
    const receiptIncome = receiptTotal[0]?.total ?? 0;
    const income = manualIncome + receiptIncome;
    const entries = [
      ...manualEntries.map(({ _id, amount, createdAt, date, description, type }) => ({
        amount,
        createdAt: createdAt.toISOString(),
        date,
        description,
        id: _id.toHexString(),
        source: "manual" as const,
        type,
      })),
      ...receiptEntries.map(({ _id, amount, createdAt, issueDate, payerName, receiptNumber }) => ({
        amount,
        createdAt: createdAt.toISOString(),
        date: issueDate,
        description: `${receiptNumber} · ${payerName}`,
        id: `receipt:${_id.toHexString()}`,
        source: "receipt" as const,
        type: "IN" as const,
      })),
    ].sort((left, right) => right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt)).slice(0, 100);

    return Response.json({
      summary: { balance: income - expense, expense, income },
      entries,
    });
  } catch {
    return Response.json({ message: "無法讀取記帳資料。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const parsed = ledgerEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "請填妥類型、日期、說明與有效金額。" }, { status: 400 });

  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user)) return Response.json({ message: "你的角色只有檢視權限，無法新增記帳資料。" }, { status: 403 });
    if (!await canUseWorkspaceFeature(user, "accounting")) return Response.json({ message: "此工作區目前無法使用記帳功能。" }, { status: 403 });

    const entry: LedgerEntryDocument = {
      ...parsed.data,
      createdAt: new Date(),
      createdBy: new ObjectId(user.id),
      organizationId: new ObjectId(user.organization.id),
    };
    const result = await (await ledgerCollection()).insertOne(entry);
    return Response.json({ id: result.insertedId.toHexString() }, { status: 201 });
  } catch {
    return Response.json({ message: "無法儲存記帳資料。" }, { status: 503 });
  }
}
