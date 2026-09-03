import { z } from "zod";

import { createPlan, getCurrentSuperAdmin, planUsageCounts } from "@/lib/platform-admin";
import { listPlans, planKeyPattern } from "@/lib/plans";
import { workspaceFeatureKeys } from "@/lib/workspace-features";

export const runtime = "nodejs";

/** `null` is an explicit "no ceiling"; a number is a ceiling. */
const allowance = z.number().int().min(0).max(1_000_000).nullable();

export const planInputSchema = z.object({
  allowances: z.object({
    members: allowance,
    quotationsPerMonth: allowance,
    receiptsPerMonth: allowance,
  }).strict(),
  currency: z.string().trim().length(3).default("HKD"),
  description: z.string().trim().max(300).default(""),
  features: z.array(z.enum(workspaceFeatureKeys)).max(workspaceFeatureKeys.length),
  isDefault: z.boolean().default(false),
  label: z.string().trim().min(1).max(60),
  // Minor units, so pricing never travels as a float.
  priceCents: z.number().int().min(0).max(100_000_000),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  // Pasted from Stripe after creating the Price there. Empty means unmapped.
  stripePriceId: z.string().trim().max(120).optional(),
}).strict();

const createSchema = planInputSchema.extend({
  key: z.string().trim().regex(planKeyPattern, "方案代碼只能使用小寫英文、數字與連字號。"),
}).strict();

export async function GET() {
  try {
    if (!await getCurrentSuperAdmin()) return Response.json({ message: "需要平台管理者權限。" }, { status: 403 });
    const [plans, usage] = await Promise.all([listPlans(), planUsageCounts()]);
    return Response.json({ plans: plans.map((plan) => ({ ...plan, workspaceCount: usage[plan.key] ?? 0 })) });
  } catch {
    return Response.json({ message: "無法讀取方案資料。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getCurrentSuperAdmin();
    if (!actor) return Response.json({ message: "需要平台管理者權限。" }, { status: 403 });
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ message: parsed.error.issues[0]?.message ?? "方案資料不正確。" }, { status: 400 });
    }
    const { key, ...input } = parsed.data;
    if (!await createPlan(actor, key, input)) {
      return Response.json({ message: "這個方案代碼已經存在。" }, { status: 409 });
    }
    return Response.json({ key });
  } catch {
    return Response.json({ message: "無法建立方案。" }, { status: 503 });
  }
}
