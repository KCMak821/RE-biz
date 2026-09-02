import { ObjectId } from "mongodb";

import type { AppUser } from "@/lib/auth";
import { customersCollection } from "@/lib/customer-store";
import { getDatabase } from "@/lib/mongodb";
import {
  calculatedLines,
  calculatedQuoteTotals,
  customerFieldsSchema,
  type CustomerFields,
  type QuoteLine,
  type QuotePayload,
  type QuoteStatus,
} from "@/lib/quotation";

type CompanySnapshot = {
  address: string;
  bankDetails: string;
  businessRegistration: string;
  email: string;
  name: string;
  phone: string;
};

export type QuoteDocument = {
  companySnapshot: CompanySnapshot;
  createdAt: Date;
  createdBy: ObjectId;
  currency: "HKD";
  customerId?: ObjectId;
  customerSnapshot: CustomerFields;
  issueDate: string;
  lines: QuoteLine[];
  notes: string;
  organizationId: ObjectId;
  quoteNumber: string;
  receiptId?: ObjectId;
  invoiceId?: ObjectId;
  status: Exclude<QuoteStatus, "expired">;
  terms: string;
  totalAmount: number;
  totalDiscount: number;
  updatedAt: Date;
  validUntil: string;
};

type QuoteCounter = {
  createdAt: Date;
  monthKey: string;
  organizationId: ObjectId;
  sequence: number;
  updatedAt: Date;
};

export async function quotesCollection() {
  const collection = (await getDatabase()).collection<QuoteDocument>("quotes");
  await Promise.all([
    // The organization is the tenant boundary, so a quote number is unique
    // company-wide rather than per creator.
    collection.createIndex(
      { organizationId: 1, quoteNumber: 1 },
      { unique: true },
    ),
    collection.createIndex({
      organizationId: 1,
      issueDate: -1,
      createdAt: -1,
    }),
    collection.createIndex({
      organizationId: 1,
      status: 1,
      validUntil: 1,
    }),
  ]);
  return collection;
}

async function quoteCountersCollection() {
  const collection = (await getDatabase()).collection<QuoteCounter>(
    "quoteCounters",
  );
  await collection.createIndex(
    { organizationId: 1, monthKey: 1 },
    { unique: true },
  );
  return collection;
}

export async function nextQuoteNumber(
  organizationId: ObjectId,
  issueDate: string,
) {
  const monthKey = issueDate.slice(0, 7).replace("-", "");
  const counters = await quoteCountersCollection();
  // Unique counters plus retry on an initial upsert race make concurrent quote
  // creation safe. The sequence is organization-wide, so every member of one
  // workspace draws from a single shared quote number series.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const counter = await counters.findOneAndUpdate(
        { monthKey, organizationId },
        {
          $inc: { sequence: 1 },
          $set: { updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date(), monthKey, organizationId },
        },
        { returnDocument: "after", upsert: true },
      );
      if (!counter) throw new Error("COUNTER_UNAVAILABLE");
      return `QUO-${monthKey}-${String(counter.sequence).padStart(4, "0")}`;
    } catch (error) {
      if (
        !(
          typeof error === "object" &&
          error &&
          "code" in error &&
          error.code === 11000
        ) ||
        attempt === 2
      )
        throw error;
    }
  }
  throw new Error("COUNTER_UNAVAILABLE");
}

export function companySnapshot(user: AppUser): CompanySnapshot {
  return {
    address: user.organization.address,
    bankDetails: user.organization.bankDetails,
    businessRegistration: user.organization.businessRegistration,
    email: user.organization.email,
    name: user.organization.name,
    phone: user.organization.phone || user.organization.contact,
  };
}

export async function resolveQuotePayload(user: AppUser, input: QuotePayload) {
  let customer = input.customer;
  if (input.customerId) {
    const savedCustomer = await (
      await customersCollection()
    ).findOne({
      _id: new ObjectId(input.customerId),
      organizationId: new ObjectId(user.organization.id),
      $or: [{ status: "active" }, { status: { $exists: false } }],
    });
    if (!savedCustomer) throw new Error("CUSTOMER_NOT_FOUND");
    customer = customerFieldsSchema.parse({
      address: savedCustomer.address,
      businessRegistration: savedCustomer.businessRegistration,
      companyName: savedCustomer.companyName,
      contact: savedCustomer.contact,
      email: savedCustomer.email,
      name: savedCustomer.name,
      notes: savedCustomer.notes,
      phone: savedCustomer.phone,
    });
  }
  const lines = calculatedLines(input.lines);
  return { ...input, customer, lines, ...calculatedQuoteTotals(lines) };
}
