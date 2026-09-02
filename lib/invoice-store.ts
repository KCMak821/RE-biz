import { ObjectId } from "mongodb";

import type { AppUser } from "@/lib/auth";
import { customersCollection } from "@/lib/customer-store";
import { getDatabase } from "@/lib/mongodb";
import { customerFieldsSchema, type CustomerFields } from "@/lib/quotation";
import { companySnapshot, type QuoteDocument } from "@/lib/quote-store";
import { calculatedInvoiceLines, calculatedInvoiceTotals, invoiceEffectiveStatus, type InvoiceLine, type InvoicePaymentStatus, type InvoiceStatus } from "@/lib/invoice";
import { sumAmounts } from "@/lib/money";

/** One recorded receipt of money against an invoice. */
export type InvoicePaymentDocument = {
  _id: ObjectId;
  amount: number;
  createdAt: Date;
  createdBy: ObjectId;
  note: string;
  paidAt: string;
};

export type InvoiceDocument = {
  companySnapshot: ReturnType<typeof companySnapshot>;
  createdAt: Date;
  createdBy: ObjectId;
  currency: string;
  customerId?: ObjectId;
  customerSnapshot: CustomerFields;
  dueDate: string;
  invoiceNumber: string;
  issueDate: string;
  lines: InvoiceLine[];
  notes: string;
  organizationId: ObjectId;
  /** Absent on invoices created before payment recording existed. */
  payments?: InvoicePaymentDocument[];
  paymentStatus: InvoicePaymentStatus;
  sentAt?: Date;
  sourceQuoteId?: ObjectId;
  sourceQuoteNumber?: string;
  status: InvoiceStatus;
  terms: string;
  totalAmount: number;
  totalDiscount: number;
  updatedAt: Date;
};
type InvoiceCounter = { createdAt: Date; monthKey: string; organizationId: ObjectId; sequence: number; updatedAt: Date };

export async function invoicesCollection() {
  const collection = (await getDatabase()).collection<InvoiceDocument>("invoices");
  await Promise.all([
    collection.createIndex({ organizationId: 1, invoiceNumber: 1 }, { unique: true }),
    collection.createIndex({ organizationId: 1, issueDate: -1, createdAt: -1 }),
    collection.createIndex({ organizationId: 1, status: 1, dueDate: 1 }),
    collection.createIndex({ organizationId: 1, sourceQuoteId: 1 }, { name: "invoice_source_quote_unique", partialFilterExpression: { sourceQuoteId: { $type: "objectId" } }, unique: true }),
  ]);
  return collection;
}
async function invoiceCountersCollection() {
  const collection = (await getDatabase()).collection<InvoiceCounter>("invoiceCounters");
  await collection.createIndex({ organizationId: 1, monthKey: 1 }, { unique: true });
  return collection;
}
export async function nextInvoiceNumber(organizationId: ObjectId, issueDate: string) {
  const monthKey = issueDate.slice(0, 7).replace("-", "");
  const counters = await invoiceCountersCollection();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const counter = await counters.findOneAndUpdate({ organizationId, monthKey }, { $inc: { sequence: 1 }, $set: { updatedAt: new Date() }, $setOnInsert: { createdAt: new Date(), monthKey, organizationId } }, { returnDocument: "after", upsert: true });
      if (!counter) throw new Error("COUNTER_UNAVAILABLE");
      return `INV-${monthKey}-${String(counter.sequence).padStart(4, "0")}`;
    } catch (error) {
      if (!(typeof error === "object" && error && "code" in error && error.code === 11000) || attempt === 2) throw error;
    }
  }
  throw new Error("COUNTER_UNAVAILABLE");
}
export async function activeCustomerSnapshot(user: AppUser, customerId: string) {
  const customer = await (await customersCollection()).findOne({ _id: new ObjectId(customerId), organizationId: new ObjectId(user.organization.id), $or: [{ status: "active" }, { status: { $exists: false } }] });
  if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
  return customerFieldsSchema.parse({
    address: customer.address,
    businessRegistration: customer.businessRegistration,
    companyName: customer.companyName,
    contact: customer.contact,
    email: customer.email,
    name: customer.name,
    notes: customer.notes,
    phone: customer.phone,
  });
}
/**
 * The wire shape of an invoice. Shared by the list, detail and payment routes so
 * all three report the same payment totals.
 */
export function serializeInvoice(document: InvoiceDocument & { _id: ObjectId }) {
  const paidAmount = invoicePaidAmount(document);
  return {
    companySnapshot: document.companySnapshot,
    createdAt: document.createdAt.toISOString(),
    currency: document.currency,
    customerId: document.customerId?.toHexString(),
    customerSnapshot: document.customerSnapshot,
    dueDate: document.dueDate,
    effectiveStatus: invoiceEffectiveStatus(document.status, document.paymentStatus, document.dueDate),
    id: document._id.toHexString(),
    invoiceNumber: document.invoiceNumber,
    issueDate: document.issueDate,
    lines: document.lines,
    notes: document.notes,
    outstandingAmount: sumAmounts([document.totalAmount, -paidAmount]),
    paidAmount,
    payments: serializeInvoicePayments(document),
    paymentStatus: document.paymentStatus,
    sentAt: document.sentAt?.toISOString(),
    sourceQuoteId: document.sourceQuoteId?.toHexString(),
    sourceQuoteNumber: document.sourceQuoteNumber,
    status: document.status,
    terms: document.terms,
    totalAmount: document.totalAmount,
    totalDiscount: document.totalDiscount,
    updatedAt: document.updatedAt.toISOString(),
  };
}

/** Total money recorded against an invoice, in the stored amount representation. */
export function invoicePaidAmount(invoice: Pick<InvoiceDocument, "payments">) {
  return sumAmounts((invoice.payments ?? []).map((payment) => payment.amount));
}

export function serializeInvoicePayments(invoice: Pick<InvoiceDocument, "payments">) {
  return [...(invoice.payments ?? [])]
    // Newest instalment first, matching how the detail page reads.
    .sort((left, right) => right.paidAt.localeCompare(left.paidAt) || right.createdAt.getTime() - left.createdAt.getTime())
    .map((payment) => ({
      amount: payment.amount,
      createdAt: payment.createdAt.toISOString(),
      id: payment._id.toHexString(),
      note: payment.note,
      paidAt: payment.paidAt,
    }));
}

export function quoteInvoiceFields(quote: QuoteDocument) {
  const lines = calculatedInvoiceLines(quote.lines);
  return { companySnapshot: quote.companySnapshot, customerId: quote.customerId, customerSnapshot: quote.customerSnapshot, currency: quote.currency, lines, notes: quote.notes, terms: quote.terms, ...calculatedInvoiceTotals(lines) };
}
