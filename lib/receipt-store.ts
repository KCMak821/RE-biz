import { ObjectId } from "mongodb";

import type { ReceiptCreateInput, ReceiptInput } from "@/lib/receipt";
import type { ReceiptTemplate } from "@/lib/receipt-template";
import { getDatabase } from "@/lib/mongodb";

export type ReceiptLineSnapshot = {
  description: string;
  discountAmount: number;
  name: string;
  quantity: number;
  subtotal: number;
  unitPrice: number;
};

export type ReceiptPaymentStatus = "pending" | "paid";

export type ReceiptDocument = ReceiptInput & {
  createdAt: Date;
  createdBy: ObjectId;
  lineItems?: ReceiptLineSnapshot[];
  organizationId: ObjectId;
  paymentStatus: ReceiptPaymentStatus;
  /** The visual contract at the time the receipt was issued. */
  receiptTemplateSnapshot?: ReceiptTemplate;
  sourceQuoteId?: ObjectId;
  sourceQuoteNumber?: string;
  updatedAt: Date;
};

type ReceiptCounter = { createdAt: Date; dateKey: string; organizationId: ObjectId; sequence: number; updatedAt: Date };

/**
 * The wire shape of a receipt. Shared by the list and the detail route so both
 * return exactly the same fields.
 */
export function serializeReceipt(document: ReceiptDocument & { _id: ObjectId }) {
  return {
    amount: document.amount,
    businessRegistration: document.businessRegistration,
    createdAt: document.createdAt.toISOString(),
    description: document.description,
    id: document._id.toHexString(),
    issueDate: document.issueDate,
    issuerAddress: document.issuerAddress,
    issuerContact: document.issuerContact,
    issuerName: document.issuerName,
    lineItems: document.lineItems,
    notes: document.notes,
    payerAddress: document.payerAddress,
    payerName: document.payerName,
    paymentMethod: document.paymentMethod,
    paymentStatus: document.paymentStatus,
    receiptNumber: document.receiptNumber,
    receiptTemplateSnapshot: document.receiptTemplateSnapshot,
    sourceQuoteId: document.sourceQuoteId?.toHexString(),
    sourceQuoteNumber: document.sourceQuoteNumber,
  };
}

export async function receiptsCollection() {
  const collection = (await getDatabase()).collection<ReceiptDocument>("receipts");
  await Promise.all([
    collection.createIndex({ organizationId: 1, receiptNumber: 1 }, { unique: true }),
    collection.createIndex({ organizationId: 1, issueDate: -1, createdAt: -1 }),
    // A compound sparse index would still index every ordinary receipt because
    // organizationId is present. Restrict uniqueness only to quote-sourced
    // receipts so existing manual receipts remain fully compatible.
    collection.createIndex(
      { organizationId: 1, sourceQuoteId: 1 },
      { name: "receipt_source_quote_unique", partialFilterExpression: { sourceQuoteId: { $type: "objectId" } }, unique: true },
    ),
  ]);
  return collection;
}

async function receiptCounters() {
  const collection = (await getDatabase()).collection<ReceiptCounter>("receiptCounters");
  await collection.createIndex({ organizationId: 1, dateKey: 1 }, { unique: true });
  return collection;
}

export async function nextReceiptNumbers(organizationId: ObjectId, receipts: Array<{ issueDate: string }>) {
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

export async function createReceiptDocuments(input: {
  createdBy: ObjectId;
  organizationId: ObjectId;
  receipts: ReceiptCreateInput[];
  receiptTemplate: ReceiptTemplate;
}) {
  const now = new Date();
  const receiptNumbers = await nextReceiptNumbers(input.organizationId, input.receipts);
  const documents: ReceiptDocument[] = input.receipts.map((receipt, index) => ({
    ...receipt,
    receiptNumber: receiptNumbers[index],
    createdAt: now,
    createdBy: input.createdBy,
    organizationId: input.organizationId,
    paymentStatus: "paid",
    receiptTemplateSnapshot: { ...input.receiptTemplate },
    updatedAt: now,
  }));
  const result = await (await receiptsCollection()).insertMany(documents);
  return { count: result.insertedCount, receiptNumbers };
}
