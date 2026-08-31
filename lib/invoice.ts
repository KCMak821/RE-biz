import { z } from "zod";

import { calculateLineSubtotal, sumAmounts } from "@/lib/money";
import { quoteLineSchema, type CustomerFields, type QuoteLineInput } from "@/lib/quotation";

export const invoiceStatuses = ["draft", "sent", "void"] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];
export const invoicePaymentStatuses = ["unpaid", "partially_paid", "paid"] as const;
export type InvoicePaymentStatus = (typeof invoicePaymentStatuses)[number];
export type InvoiceEffectiveStatus = "draft" | "unpaid" | "overdue" | "partially_paid" | "paid" | "void";

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
