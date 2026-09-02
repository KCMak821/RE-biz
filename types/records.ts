import type { ReceiptTemplate } from "@/lib/receipt-template";

/**
 * The record shapes the browser receives from `/api/**`. They mirror the
 * serialisers in the route handlers; nothing here changes the API contract.
 */

export type Customer = {
  address: string;
  businessRegistration: string;
  companyName: string;
  contact: string;
  createdAt?: string;
  email: string;
  id: string;
  name: string;
  notes: string;
  phone: string;
  status?: "active" | "archived";
  updatedAt?: string;
};

export type Item = {
  description: string;
  id: string;
  isActive: boolean;
  name: string;
  sku: string;
  unitPrice: number;
};

export type DocumentLine = {
  description: string;
  discountAmount: number;
  name: string;
  quantity: number;
  subtotal?: number;
  unitPrice: number;
};

export type CompanySnapshot = {
  address: string;
  bankDetails: string;
  businessRegistration: string;
  contact?: string;
  email: string;
  name: string;
  phone: string;
};

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

export type Quote = {
  companySnapshot: CompanySnapshot;
  createdAt?: string;
  currency?: string;
  customerId?: string;
  customerSnapshot: Customer;
  id: string;
  invoiceId?: string;
  issueDate: string;
  lines: Array<DocumentLine & { subtotal: number }>;
  notes: string;
  quoteNumber: string;
  receiptId?: string;
  status: QuoteStatus;
  storedStatus: "draft" | "sent" | "accepted" | "rejected";
  terms: string;
  totalAmount: number;
  totalDiscount: number;
  updatedAt?: string;
  validUntil: string;
};

export type QuoteLinks = {
  invoice: { id: string; invoiceNumber: string } | null;
  receipt: { id: string; paymentStatus: "pending" | "paid"; receiptNumber: string } | null;
};

export type InvoiceStatus = "draft" | "unpaid" | "overdue" | "partially_paid" | "paid" | "void";

/** One recorded receipt of money against an invoice. */
export type InvoicePayment = {
  amount: number;
  createdAt: string;
  createdBy: string;
  /** Who registered it, snapshotted when the instalment was recorded. */
  createdByName: string;
  id: string;
  note: string;
  paidAt: string;
  paymentMethod: string;
  reference: string;
};

export type Invoice = {
  companySnapshot: CompanySnapshot;
  createdAt?: string;
  customerId?: string;
  customerSnapshot: Customer;
  dueDate: string;
  effectiveStatus: InvoiceStatus;
  id: string;
  invoiceNumber: string;
  issueDate: string;
  lines: Array<DocumentLine & { subtotal: number }>;
  notes: string;
  /** Total still to be collected: totalAmount − paidAmount. */
  outstandingAmount: number;
  paidAmount: number;
  payments: InvoicePayment[];
  paymentStatus: "unpaid" | "partially_paid" | "paid";
  sentAt?: string;
  sourceQuoteId?: string;
  sourceQuoteNumber?: string;
  status: "draft" | "sent" | "void";
  terms: string;
  totalAmount: number;
  totalDiscount: number;
};

/** Documents reachable from an invoice. Absent links are simply `null`. */
export type InvoiceLinks = {
  receipt: { id: string; paymentStatus: "pending" | "paid"; receiptNumber: string } | null;
};

export type ReceiptLineItem = {
  description: string;
  discountAmount: number;
  name: string;
  quantity: number;
  subtotal: number;
  unitPrice: number;
};

export type SavedReceipt = {
  amount: number;
  businessRegistration: string;
  createdAt: string;
  description: string;
  id: string;
  issueDate: string;
  issuerAddress: string;
  issuerContact: string;
  issuerName: string;
  lineItems?: ReceiptLineItem[];
  notes: string;
  payerAddress: string;
  payerName: string;
  paymentMethod: string;
  paymentStatus?: "pending" | "paid";
  receiptNumber: string;
  receiptTemplateSnapshot?: ReceiptTemplate;
  sourceInvoiceId?: string;
  sourceInvoiceNumber?: string;
  sourceQuoteId?: string;
  sourceQuoteNumber?: string;
};

/** The editable shape of a single receipt, before it has a number. */
export type ReceiptDraft = {
  amount: string;
  businessRegistration: string;
  description: string;
  issueDate: string;
  issuerAddress: string;
  issuerContact: string;
  issuerName: string;
  lineItems?: ReceiptLineItem[];
  notes: string;
  payerAddress: string;
  payerName: string;
  paymentMethod: string;
  receiptNumber: string;
  sourceQuoteNumber?: string;
};

export type LedgerEntry = {
  amount: number;
  createdAt: string;
  date: string;
  description: string;
  id: string;
  source: "manual" | "receipt";
  type: "IN" | "OUT";
};

export type LedgerSummary = { balance: number; expense: number; income: number };

export type Member = {
  email: string;
  id: string;
  mustChangePassword: boolean;
  name: string;
  role: "owner" | "admin" | "operator" | "viewer";
  status: "active" | "suspended";
};
