import { ObjectId, type ClientSession } from "mongodb";

import { getDatabase } from "@/lib/mongodb";

/**
 * Reading and writing workspace feature switches. Lives apart from
 * `lib/platform-admin` so `lib/auth` can read switches for the session without
 * importing platform-admin (which imports auth back). The vocabulary itself is
 * in `lib/workspace-feature-keys`, which carries no database.
 */
export { defaultWorkspaceFeatures, noWorkspaceFeatures, workspaceFeatureKeys, type WorkspaceFeatureKey, type WorkspaceFeatures } from "@/lib/workspace-feature-keys";
import { defaultWorkspaceFeatures, workspaceFeatureKeys, type WorkspaceFeatureKey, type WorkspaceFeatures } from "@/lib/workspace-feature-keys";

export type WorkspaceFeatureDocument = {
  createdAt: Date;
  enabled: boolean;
  featureKey: WorkspaceFeatureKey;
  organizationId: ObjectId;
  updatedAt: Date;
};

export function workspaceFeaturesCollection(database: Awaited<ReturnType<typeof getDatabase>>) {
  return database.collection<WorkspaceFeatureDocument>("workspaceFeatures");
}

export async function readWorkspaceFeatures(organizationId: ObjectId): Promise<WorkspaceFeatures> {
  const rows = await workspaceFeaturesCollection(await getDatabase()).find({ organizationId }).toArray();
  const features = defaultWorkspaceFeatures();
  for (const row of rows) {
    if (workspaceFeatureKeys.includes(row.featureKey)) features[row.featureKey] = row.enabled;
  }
  return features;
}

export async function isWorkspaceFeatureEnabled(organizationId: ObjectId, featureKey: WorkspaceFeatureKey) {
  const feature = await workspaceFeaturesCollection(await getDatabase()).findOne({ organizationId, featureKey });
  return feature?.enabled ?? true;
}

/**
 * Rewrites every switch to match what a plan includes, and reports what it set.
 *
 * Called when a workspace moves onto another plan so the paid boundary takes
 * effect on its own rather than waiting for someone to remember. It writes every
 * key, not only the ones the plan grants: a switch left at its default would
 * read as "on", which is exactly the gap this closes. Any goodwill exception
 * made on the old plan is dropped along with the old plan — re-granting one is
 * a deliberate act, and the audit log records both.
 */
export async function applyPlanFeatures(
  organizationId: ObjectId,
  planFeatures: readonly WorkspaceFeatureKey[],
  session?: ClientSession,
): Promise<WorkspaceFeatures> {
  const included = new Set(planFeatures);
  const now = new Date();
  await workspaceFeaturesCollection(await getDatabase()).bulkWrite(
    workspaceFeatureKeys.map((featureKey) => ({
      updateOne: {
        filter: { featureKey, organizationId },
        update: { $set: { enabled: included.has(featureKey), updatedAt: now }, $setOnInsert: { createdAt: now } },
        upsert: true,
      },
    })),
    { session },
  );
  const applied = defaultWorkspaceFeatures();
  for (const featureKey of workspaceFeatureKeys) applied[featureKey] = included.has(featureKey);
  return applied;
}
