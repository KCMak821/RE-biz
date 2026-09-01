import { ObjectId } from "mongodb";

import { getDatabase } from "@/lib/mongodb";

/**
 * Workspace feature switches, in their own module so `lib/auth` can read them
 * for the session without importing `lib/platform-admin` (which imports auth
 * back).
 */
export const workspaceFeatureKeys = ["receipts", "accounting", "quotations", "invoices"] as const;
export type WorkspaceFeatureKey = (typeof workspaceFeatureKeys)[number];
export type WorkspaceFeatures = Record<WorkspaceFeatureKey, boolean>;

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

/** Features default to on: a workspace with no rows has everything available. */
export function defaultWorkspaceFeatures(): WorkspaceFeatures {
  return { accounting: true, invoices: true, quotations: true, receipts: true };
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
