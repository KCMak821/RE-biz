import { z } from "zod";

import { amountToCents, calculateLineSubtotal, sumAmounts } from "@/lib/money";
import { quoteLineSchema, type CustomerFields, type QuoteLineInput } from "@/lib/quotation";

export const invoiceStatuses = ["draft", "sent", "void"] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];
export const invoicePaymentStatuses = ["unpaid", "partially_paid", "paid"] as const;
export type InvoicePaymentStatus = (typeof invoicePaymentStatuses)[number];
export type InvoiceEffectiveStatus = "draft" | "unpaid" | "overdue" | "partially_paid" | "paid" | "void";

/**
 * A single receipt of money against an invoice. Payments are recorded rather
 * than the status being set directly, so "how much is still outstanding" and
 * "when did each instalment arrive" are answerable from the data.
 */
export const invoicePaymentSchema = z.object({
  amount: z.coerce.number().finite().positive().max(999_999_999),
  /** Free text for the team; never printed on a receipt. */
  note: z.string().trim().max(500).optional().default(""),
  paidAt: z.string().date(),
  /** How the money arrived — this is what a receipt states. */
  paymentMethod: z.string().trim().max(100).optional().default(""),
  /** Bank reference, cheque number, transaction id. */
  reference: z.string().trim().max(200).optional().default(""),
}).strict();
export type InvoicePaymentInput = z.infer<typeof invoicePaymentSchema>;

/** Derives the payment status from the recorded payments, never the other way round. */
export function invoicePaymentStatusFor(paidAmount: number, totalAmount: number): InvoicePaymentStatus {
  const paidCents = amountToCents(paidAmount);
  const totalCents = amountToCents(totalAmount);
  if (paidCents <= 0) return "unpaid";
  return paidCents >= totalCents ? "paid" : "partially_paid";
}

export const invoicePayloadSchema = z.object({
  customerId: z.string().regex(/^[a-f\d]{24}$/i),
  dueDate: z.string().date(),
  issueDate: z.string().date(),
  lines: z.array(quoteLineSchema).min(1).max(100),
  notes: z.string().trim().max(4000).default(""),
  terms: z.string().trim().max(4000).default(""),
}).strict().superRefine((value, context) => {
  if (value.dueDate < value.issueDate) context.addIssue({ code: z.ZodIssueCode.custom, message: "到期日不可早於開立日期。", path: ["dueDate"] });
});
export type InvoicePayload = z.infer<typeof invoicePayloadSchema>;
export type InvoiceLine = QuoteLineInput & { subtotal: number };

export function calculatedInvoiceLines(lines: QuoteLineInput[]): InvoiceLine[] {
  return lines.map((line) => ({ ...line, subtotal: calculateLineSubtotal(line.unitPrice, line.quantity, line.discountAmount) }));
}
export function calculatedInvoiceTotals(lines: InvoiceLine[]) {
  return { totalAmount: sumAmounts(lines.map((line) => line.subtotal)), totalDiscount: sumAmounts(lines.map((line) => line.discountAmount)) };
}
export function invoiceEffectiveStatus(status: InvoiceStatus, paymentStatus: InvoicePaymentStatus, dueDate: string, now = new Date()): InvoiceEffectiveStatus {
  if (status === "void") return "void";
  if (status === "draft") return "draft";
  if (paymentStatus === "paid") return "paid";
  if (paymentStatus === "partially_paid") return "partially_paid";
  return dueDate < now.toISOString().slice(0, 10) ? "overdue" : "unpaid";
}

export type InvoiceCustomerSnapshot = CustomerFields;
