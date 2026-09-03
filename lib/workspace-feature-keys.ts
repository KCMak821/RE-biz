/**
 * The feature vocabulary, with nothing behind it.
 *
 * Split out of `lib/workspace-features` so client components can name a feature
 * without importing the module that opens a database connection: a single value
 * import pulls in the whole module graph, and the MongoDB driver's Node
 * built-ins do not resolve in a browser bundle.
 */
export const workspaceFeatureKeys = ["receipts", "accounting", "quotations", "invoices"] as const;
export type WorkspaceFeatureKey = (typeof workspaceFeatureKeys)[number];
export type WorkspaceFeatures = Record<WorkspaceFeatureKey, boolean>;

/** Features default to on: a workspace with no rows has everything available. */
export function defaultWorkspaceFeatures(): WorkspaceFeatures {
  return { accounting: true, invoices: true, quotations: true, receipts: true };
}
