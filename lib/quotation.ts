import { z } from "zod";

import { calculateLineSubtotal, sumAmounts } from "@/lib/money";

export const quoteStatuses = ["draft", "sent", "accepted", "rejected", "expired"] as const;
export type QuoteStatus = typeof quoteStatuses[number];

const moneySchema = z.coerce.number().finite().min(0).max(999_999_999).refine(
  (value) => Math.round(value * 100) === value * 100,
  "金額最多只可有兩位小數。",
);
const quantitySchema = z.coerce.number().finite().positive().max(999_999).refine(
  (value) => Math.round(value * 1000) === value * 1000,
  "數量最多只可有三位小數。",
);

export const customerFieldsSchema = z.object({
  address: z.string().trim().max(1000).default(""),
  contact: z.string().trim().max(200).default(""),
  email: z.string().trim().email().max(320).or(z.literal("")).default(""),
  name: z.string().trim().min(1).max(300),
  notes: z.string().trim().max(2000).default(""),
  phone: z.string().trim().max(100).default(""),
}).strict();
export type CustomerFields = z.infer<typeof customerFieldsSchema>;

export const itemFieldsSchema = z.object({
  description: z.string().trim().max(2000).default(""),
  isActive: z.boolean().default(true),
  name: z.string().trim().min(1).max(500),
  sku: z.string().trim().max(100).default(""),
  unitPrice: moneySchema,
}).strict();
export type ItemFields = z.infer<typeof itemFieldsSchema>;

export const quoteLineSchema = z.object({
  description: z.string().trim().max(2000).default(""),
  discountAmount: moneySchema.default(0),
  name: z.string().trim().min(1).max(500),
  quantity: quantitySchema,
  unitPrice: moneySchema,
}).strict();
export type QuoteLineInput = z.infer<typeof quoteLineSchema>;

export const quotePayloadSchema = z.object({
  customer: customerFieldsSchema,
  customerId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  issueDate: z.string().date(),
  lines: z.array(quoteLineSchema).min(1).max(100),
  notes: z.string().trim().max(4000).default(""),
  terms: z.string().trim().max(4000).default(""),
  validUntil: z.string().date(),
}).strict().superRefine((value, context) => {
  if (value.validUntil < value.issueDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "有效期限不可早於開立日期。", path: ["validUntil"] });
  }
});
export type QuotePayload = z.infer<typeof quotePayloadSchema>;

export type QuoteLine = QuoteLineInput & { subtotal: number };

export function calculatedLines(lines: QuoteLineInput[]): QuoteLine[] {
  return lines.map((line) => ({ ...line, subtotal: calculateLineSubtotal(line.unitPrice, line.quantity, line.discountAmount) }));
}

export function calculatedQuoteTotals(lines: QuoteLine[]) {
  return {
    totalAmount: sumAmounts(lines.map((line) => line.subtotal)),
    totalDiscount: sumAmounts(lines.map((line) => line.discountAmount)),
  };
}

export function quoteEffectiveStatus(status: Exclude<QuoteStatus, "expired">, validUntil: string, now = new Date()) : QuoteStatus {
  const today = now.toISOString().slice(0, 10);
  return validUntil < today ? "expired" : status;
}
