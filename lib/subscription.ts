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

/** How close a recorded date is to lapsing. Nothing acts on this; it is shown. */
export type ExpiryState = "none" | "upcoming" | "expired";

/** A date within this many days counts as "upcoming" rather than merely future. */
export const expiryWarningDays = 14;

export function expiryState(value: string | null | undefined, now: Date = new Date()): ExpiryState {
  if (!value) return "none";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "none";
  if (date.getTime() < now.getTime()) return "expired";
  const days = (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return days <= expiryWarningDays ? "upcoming" : "none";
}

/**
 * Where a workspace's feature switches disagree with what its plan is meant to
 * include.
 *
 * The two are deliberately independent — a plan records what is paid for, the
 * switches decide what works — so drift is normal and often intentional (a
 * goodwill gesture, a trial of one feature). It is worth showing rather than
 * correcting: before allowances can be enforced, you want to know how far the
 * plans on paper have drifted from what customers actually have.
 */
export type PlanDrift = {
  /** Switched on although the plan does not include it. */
  extra: WorkspaceFeatureKey[];
  /** Included in the plan but switched off. */
  missing: WorkspaceFeatureKey[];
};

export function planDrift(planKey: PlanKey, enabled: Record<WorkspaceFeatureKey, boolean>): PlanDrift {
  const included = new Set<WorkspaceFeatureKey>(plans[planKey].features);
  const keys = Object.keys(enabled) as WorkspaceFeatureKey[];
  return {
    extra: keys.filter((key) => enabled[key] && !included.has(key)),
    missing: keys.filter((key) => !enabled[key] && included.has(key)),
  };
}

export function hasDrift(drift: PlanDrift) {
  return drift.extra.length > 0 || drift.missing.length > 0;
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
