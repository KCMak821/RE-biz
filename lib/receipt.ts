import { z } from "zod";

const receiptFields = z.object({
  amount: z.coerce.number().finite().min(0),
  businessRegistration: z.string().trim().max(100).optional().default(""),
  description: z.string().trim().min(1).max(2000),
  issueDate: z.string().date(),
  issuerAddress: z.string().trim().max(1000).optional().default(""),
  issuerContact: z.string().trim().max(500).optional().default(""),
  issuerName: z.string().trim().min(1).max(300),
  notes: z.string().trim().max(2000).optional().default(""),
  payerAddress: z.string().trim().max(1000).optional().default(""),
  payerName: z.string().trim().min(1).max(300),
  paymentMethod: z.string().trim().min(1).max(100),
});

export const receiptCreateSchema = receiptFields.strict();
export const receiptInputSchema = receiptFields.extend({
  receiptNumber: z.string().trim().min(1).max(100),
}).strict();

export type ReceiptCreateInput = z.infer<typeof receiptCreateSchema>;
export type ReceiptInput = z.infer<typeof receiptInputSchema>;
