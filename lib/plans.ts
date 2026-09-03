import { getDatabase } from "@/lib/mongodb";
import type { Plan, PlanAllowances } from "@/lib/plan-types";
import { workspaceFeatureKeys, type WorkspaceFeatureKey } from "@/lib/workspace-features";

/**
 * Plans live in the database, not in the source.
 *
 * They used to be a hard-coded table, which made every price or allowance
 * change a code edit, a build and a deploy — the wrong shape for a decision
 * that belongs to whoever runs the business, and one they will revisit. Reads
 * go through here; changes go through `lib/platform-admin` so they are audited
 * like every other back-office mutation.
 *
 * A plan key is validated at runtime rather than by the type system: what
 * counts as a real plan is whatever the platform admin has created. The shape
 * and the pure helpers live in `lib/plan-types`, which client components can
 * import without pulling the database driver into the browser.
 */

export {
  fallbackPlan, formatPlanPrice, isValidPlanKey, planKeyPattern, resolvePlan,
  type Plan, type PlanAllowances,
} from "@/lib/plan-types";

export type PlanDocument = {
  _id: string;
  allowances: PlanAllowances;
  archived: boolean;
  createdAt: Date;
  currency: string;
  description: string;
  features: WorkspaceFeatureKey[];
  /** The plan new companies land on. Exactly one plan holds this. */
  isDefault: boolean;
  label: string;
  priceCents: number;
  sortOrder: number;
  stripePriceId?: string;
  updatedAt: Date;
};

export function plansCollection(database: Awaited<ReturnType<typeof getDatabase>>) {
  return database.collection<PlanDocument>("plans");
}

export async function preparePlanCollections() {
  const database = await getDatabase();
  await plansCollection(database).createIndex({ sortOrder: 1, _id: 1 });
}

function toPlan(document: PlanDocument): Plan {
  return {
    allowances: document.allowances,
    archived: document.archived === true,
    currency: document.currency || "HKD",
    description: document.description ?? "",
    features: (document.features ?? []).filter((key) => workspaceFeatureKeys.includes(key)),
    isDefault: document.isDefault === true,
    key: document._id,
    label: document.label,
    priceCents: document.priceCents ?? 0,
    sortOrder: document.sortOrder ?? 0,
    stripePriceId: document.stripePriceId || null,
  };
}

export async function listPlans({ includeArchived = true }: { includeArchived?: boolean } = {}): Promise<Plan[]> {
  await preparePlanCollections();
  const database = await getDatabase();
  const documents = await plansCollection(database)
    .find(includeArchived ? {} : { archived: { $ne: true } })
    .sort({ sortOrder: 1, _id: 1 })
    .toArray();
  return documents.map(toPlan);
}

export async function plansByKey(): Promise<Map<string, Plan>> {
  return new Map((await listPlans()).map((plan) => [plan.key, plan]));
}

/** Which plan a Stripe Price maps to, or null when nothing is mapped to it. */
export async function planForStripePrice(priceId: string): Promise<Plan | null> {
  return (await listPlans()).find((plan) => plan.stripePriceId === priceId) ?? null;
}

export async function getPlan(key: string): Promise<Plan | null> {
  const database = await getDatabase();
  const document = await plansCollection(database).findOne({ _id: key });
  return document ? toPlan(document) : null;
}
