import type { WorkspaceFeatureKey } from "@/lib/workspace-features";

/**
 * Groundwork for paid subscriptions.
 *
 * Billing is per company, per month: one price for a workspace regardless of
 * how many people use it or how much they issue. Plans differ by which
 * features they include and by soft monthly allowances.
 *
 * Nothing here is enforced. A workspace over its allowance is reported in the
 * platform admin and nothing else — no API refuses a request because of a plan.
 * That is deliberate: the allowances below are placeholders, and blocking real
 * customers against numbers nobody has committed to would be worse than being
 * briefly over-served. `lib/platform-admin` reports the overage so the real
 * distribution can be seen before any price or limit is fixed.
 *
 * This module also holds no payment-provider concepts. When one is chosen, its
 * customer and subscription identifiers go in the `external*` fields on the
 * subscription record, and this file stays provider-agnostic.
 */

export const planKeys = ["free", "starter", "pro"] as const;
export type PlanKey = typeof planKeys[number];

export const subscriptionStatuses = ["trialing", "active", "past_due", "canceled"] as const;
export type SubscriptionStatus = typeof subscriptionStatuses[number];

/** `null` means "no ceiling", which is not the same as a ceiling of zero. */
export type PlanAllowances = {
  members: number | null;
  quotationsPerMonth: number | null;
  receiptsPerMonth: number | null;
};

export type Plan = {
  allowances: PlanAllowances;
  description: string;
  /** What the plan is meant to include. Not wired into access control yet. */
  features: readonly WorkspaceFeatureKey[];
  key: PlanKey;
  label: string;
};

/**
 * PLACEHOLDER NUMBERS. These are a shape to measure against, not a price list.
 * Replace the allowances and the feature sets once pricing is decided; only
 * this table needs to change.
 */
export const plans: Record<PlanKey, Plan> = {
  free: {
    allowances: { members: 2, quotationsPerMonth: 10, receiptsPerMonth: 20 },
    description: "讓新公司先把流程跑通，額度足夠日常試用。",
    features: ["receipts", "accounting"],
    key: "free",
    label: "免費",
  },
  starter: {
    allowances: { members: 10, quotationsPerMonth: 150, receiptsPerMonth: 300 },
    description: "適合已經穩定出單、需要報價與請款的小公司。",
    features: ["receipts", "accounting", "quotations", "invoices"],
    key: "starter",
    label: "標準",
  },
  pro: {
    allowances: { members: null, quotationsPerMonth: null, receiptsPerMonth: null },
    description: "不限成員與用量，適合出單量大的公司。",
    features: ["receipts", "accounting", "quotations", "invoices"],
    key: "pro",
    label: "專業",
  },
};

export const defaultPlanKey: PlanKey = "free";

export type WorkspaceSubscription = {
  currentPeriodEnd: string | null;
  /** Set aside for a future payment provider. Nothing reads these yet. */
  externalCustomerId: string | null;
  externalSubscriptionId: string | null;
  note: string | null;
  planKey: PlanKey;
  startedAt: string;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
};

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && (planKeys as readonly string[]).includes(value);
}

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === "string" && (subscriptionStatuses as readonly string[]).includes(value);
}

export function planFor(planKey: string | undefined | null): Plan {
  return isPlanKey(planKey) ? plans[planKey] : plans[defaultPlanKey];
}

/**
 * How a month's usage sits against an allowance. `null` allowances never
 * report an overage, and a plan someone is over is a fact to surface, not an
 * error to raise.
 */
export function allowanceState(used: number, allowance: number | null) {
  if (allowance === null) return { allowance, over: false, ratio: 0, used };
  return { allowance, over: used > allowance, ratio: allowance === 0 ? 1 : used / allowance, used };
}
