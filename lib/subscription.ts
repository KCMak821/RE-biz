import type { Plan } from "@/lib/plan-types";
import type { WorkspaceFeatureKey } from "@/lib/workspace-feature-keys";

/**
 * Subscription vocabulary and the arithmetic around it.
 *
 * The plans themselves live in the database (see `lib/plans`), because pricing
 * is a decision the business makes and revisits, not a constant a deploy ships.
 * What stays here is everything that does not depend on any particular plan:
 * the statuses, how usage sits against an allowance, when a date is about to
 * lapse, and where a workspace's switches disagree with what it pays for.
 *
 * Billing is per company, per month: one price for a workspace regardless of
 * how many people use it or how much they issue.
 *
 * None of it is enforced. A workspace over its allowance is reported in the
 * platform admin and nothing else — no API refuses a request because of a plan,
 * and no trial lapses into a suspension on its own.
 *
 * There are no payment-provider concepts here either. When one is chosen, its
 * identifiers go in the `external*` fields on the subscription record.
 */

/** A plan key is validated against the stored plans, not against a fixed union. */
export type PlanKey = string;

export const subscriptionStatuses = ["trialing", "active", "past_due", "canceled"] as const;
export type SubscriptionStatus = typeof subscriptionStatuses[number];

export type WorkspaceSubscription = {
  currentPeriodEnd: string | null;
  /** Set aside for a future payment provider. Nothing reads these yet. */
  externalCustomerId: string | null;
  externalSubscriptionId: string | null;
  note: string | null;
  planKey: PlanKey;
  /**
   * What this company was recorded as paying when its plan was last set, so
   * raising a plan's price does not silently rewrite what existing customers
   * are on. The admin shows where the two have diverged; nothing migrates by
   * itself, because who to reprice is a decision, not a side effect.
   */
  priceCents: number | null;
  priceCurrency: string | null;
  startedAt: string;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
};

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === "string" && (subscriptionStatuses as readonly string[]).includes(value);
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
 * Where a workspace's feature switches disagree with what its plan includes.
 *
 * Moving a company onto another plan resets its switches to that plan, so a
 * workspace leaves a plan change with no drift at all. What remains is drift
 * introduced afterwards and on purpose — a goodwill gesture, a trial of one
 * feature — plus every workspace whose plan has not changed since a feature was
 * added to the vocabulary, which is exactly the list worth looking at. It is
 * shown rather than corrected: an exception someone made by hand is not a bug.
 */
export type PlanDrift = {
  /** Switched on although the plan does not include it. */
  extra: WorkspaceFeatureKey[];
  /** Included in the plan but switched off. */
  missing: WorkspaceFeatureKey[];
};

export function planDrift(plan: Plan, enabled: Record<WorkspaceFeatureKey, boolean>): PlanDrift {
  const included = new Set<WorkspaceFeatureKey>(plan.features);
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

/** True when a company is recorded at a different price than its plan now costs. */
export function priceDiverged(subscription: WorkspaceSubscription, plan: Plan) {
  return subscription.priceCents !== null && subscription.priceCents !== plan.priceCents;
}
