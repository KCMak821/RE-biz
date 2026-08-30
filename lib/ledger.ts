import { z } from "zod";

export const ledgerEntrySchema = z.object({
  amount: z.coerce.number().finite().positive().max(999_999_999),
  date: z.string().date(),
  description: z.string().trim().min(1).max(500),
  type: z.enum(["IN", "OUT"]),
}).strict();

export type LedgerEntryInput = z.infer<typeof ledgerEntrySchema>;
