import { ObjectId } from "mongodb";

import { getDatabase } from "@/lib/mongodb";

/**
 * Reading and writing workspace feature switches. Lives apart from
 * `lib/platform-admin` so `lib/auth` can read switches for the session without
 * importing platform-admin (which imports auth back). The vocabulary itself is
 * in `lib/workspace-feature-keys`, which carries no database.
 */
export { defaultWorkspaceFeatures, workspaceFeatureKeys, type WorkspaceFeatureKey, type WorkspaceFeatures } from "@/lib/workspace-feature-keys";
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
