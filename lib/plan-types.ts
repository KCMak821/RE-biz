import { workspaceFeatureKeys, type WorkspaceFeatureKey } from "@/lib/workspace-feature-keys";

/**
 * The shape of a plan, and everything about one that needs no database.
 *
 * Kept apart from `lib/plans` so the admin's client components can format and
 * validate a plan without dragging the MongoDB driver into the browser bundle —
 * importing a single value from a module that touches the database pulls in the
 * whole module graph, and Node built-ins do not resolve there.
 */

export type PlanAllowances = {
  /** `null` means "no ceiling", which is not the same as a ceiling of zero. */
  members: number | null;
  quotationsPerMonth: number | null;
  receiptsPerMonth: number | null;
};

export type Plan = {
  allowances: PlanAllowances;
  archived: boolean;
  currency: string;
  description: string;
  features: WorkspaceFeatureKey[];
  isDefault: boolean;
  key: string;
  label: string;
  /** Monthly price in minor units, so no float ever touches money. */
  priceCents: number;
  sortOrder: number;
  /**
   * The Stripe Price this plan corresponds to. Set by hand in the platform
   * admin after creating the Price in Stripe; it is how an incoming webhook
   * knows which plan a subscription is on.
   */
  stripePriceId: string | null;
};

/** The shape a plan key must take: URL- and id-safe, and stable once created. */
export const planKeyPattern = /^[a-z0-9][a-z0-9-]{0,30}$/;

export function isValidPlanKey(value: unknown): value is string {
  return typeof value === "string" && planKeyPattern.test(value);
}

/**
 * A plan that no longer exists must not make a workspace unreadable, so
 * lookups fall back to the default plan and then to a hard floor.
 */
export function resolvePlan(plans: Map<string, Plan>, key: string | null | undefined): Plan {
  if (key) {
    const exact = plans.get(key);
    if (exact) return exact;
  }
  for (const plan of plans.values()) if (plan.isDefault) return plan;
  return [...plans.values()][0] ?? fallbackPlan(key ?? "unknown");
}

/** Used only when no plan exists at all, so the admin still renders. */
export function fallbackPlan(key: string): Plan {
  return {
    allowances: { members: null, quotationsPerMonth: null, receiptsPerMonth: null },
    archived: false,
    currency: "HKD",
    description: "這個方案已不存在，請重新指派。",
    features: [...workspaceFeatureKeys],
    isDefault: false,
    key,
    label: key,
    priceCents: 0,
    sortOrder: 0,
    stripePriceId: null,
  };
}

export function formatPlanPrice(priceCents: number, currency: string) {
  if (!priceCents) return "免費";
  const amount = priceCents / 100;
  try {
    return new Intl.NumberFormat("zh-HK", { currency, style: "currency" }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
