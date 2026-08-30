import { ObjectId } from "mongodb";
import { z } from "zod";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { receiptCreateSchema, type ReceiptInput } from "@/lib/receipt";

export const runtime = "nodejs";

type ReceiptDocument = ReceiptInput & {
  createdAt: Date;
  createdBy: ObjectId;
  organizationId: ObjectId;
  updatedAt: Date;
};

type ReceiptCounter = { createdAt: Date; dateKey: string; organizationId: ObjectId; sequence: number; updatedAt: Date };

const batchSchema = z.object({ receipts: z.array(receiptCreateSchema).min(1).max(100) }).strict();

async function requireUser() {
  const user = await getCurrentUser();
  return user;
}

async function receiptsCollection() {
  const collection = (await getDatabase()).collection<ReceiptDocument>("receipts");
  await collection.createIndex({ organizationId: 1, receiptNumber: 1 }, { unique: true });
  await collection.createIndex({ organizationId: 1, issueDate: -1, createdAt: -1 });
  return collection;
}

async function receiptCounters() {
  const collection = (await getDatabase()).collection<ReceiptCounter>("receiptCounters");
  await collection.createIndex({ organizationId: 1, dateKey: 1 }, { unique: true });
  return collection;
}

async function nextReceiptNumbers(organizationId: ObjectId, receipts: Array<{ issueDate: string }>) {
  const numbers = Array<string>(receipts.length);
  const groups = new Map<string, number[]>();
  receipts.forEach((receipt, index) => {
    const dateKey = receipt.issueDate.replaceAll("-", "");
    groups.set(dateKey, [...(groups.get(dateKey) ?? []), index]);
  });

  const collection = await receiptsCollection();
  const counters = await receiptCounters();
  for (const [dateKey, indexes] of groups) {
    const existingCounter = await counters.findOne({ organizationId, dateKey });
    if (!existingCounter) {
      const existingNumbers = await collection.find({ organizationId, issueDate: `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}` }, { projection: { receiptNumber: 1 } }).toArray();
      const highestExisting = existingNumbers.reduce((highest, receipt) => {
        const match = new RegExp(`^RC-${dateKey}-(\\d+)$`).exec(receipt.receiptNumber);
        return match ? Math.max(highest, Number(match[1])) : highest;
      }, 0);
      await counters.updateOne(
        { organizationId, dateKey },
        { $setOnInsert: { createdAt: new Date(), dateKey, organizationId, sequence: highestExisting, updatedAt: new Date() } },
        { upsert: true },
      );
    }
    const counter = await counters.findOneAndUpdate(
      { organizationId, dateKey },
      { $inc: { sequence: indexes.length }, $set: { updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!counter) throw new Error("COUNTER_UNAVAILABLE");
    const firstSequence = counter.sequence - indexes.length + 1;
    indexes.forEach((receiptIndex, index) => { numbers[receiptIndex] = `RC-${dateKey}-${String(firstSequence + index).padStart(3, "0")}`; });
  }
  return numbers;
}

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });

    const collection = await receiptsCollection();
    const organizationId = new ObjectId(user.organization.id);
    const receipts = await collection
      .find({ organizationId: new ObjectId(user.organization.id) })
      .sort({ issueDate: -1, createdAt: -1 })
      .limit(20)
      .toArray();
    const descriptionSuggestions = await collection.aggregate<{ _id: string }>([
      { $match: { organizationId, description: { $ne: "" } } },
      { $group: { _id: "$description", latestCreatedAt: { $max: "$createdAt" } } },
      { $sort: { latestCreatedAt: -1 } },
      { $limit: 12 },
    ]).toArray();
    return Response.json({
      descriptionSuggestions: descriptionSuggestions.map(({ _id }) => _id),
      receipts: receipts.map(({ _id, amount, createdAt, issueDate, payerName, receiptNumber }) => ({
        amount,
        createdAt: createdAt.toISOString(),
        id: _id.toHexString(),
        issueDate,
        payerName,
        receiptNumber,
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

    const now = new Date();
    const organizationId = new ObjectId(user.organization.id);
    const receiptNumbers = await nextReceiptNumbers(organizationId, parsed.data.receipts);
    const documents: ReceiptDocument[] = parsed.data.receipts.map((receipt, index) => ({
      ...receipt, receiptNumber: receiptNumbers[index],
      createdAt: now,
      createdBy: new ObjectId(user.id),
      organizationId,
      updatedAt: now,
    }));
    const result = await (await receiptsCollection()).insertMany(documents);
    return Response.json({ count: result.insertedCount, receiptNumbers }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000) {
      return Response.json({ message: "系統派號發生衝突，請重新生成收據。" }, { status: 409 });
    }
    return Response.json({ message: "無法儲存收據資料。" }, { status: 503 });
  }
}
