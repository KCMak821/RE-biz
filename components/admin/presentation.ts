/**
 * Audit-log vocabulary. Status, role and feature labels now live in
 * `lib/status.ts` so the admin and the workspace use the same words.
 */
import { featureLabel, featureLabels } from "@/lib/status";

const auditActionLabels: Record<string, string> = {
  FEATURE_DISABLED: "關閉功能",
  FEATURE_ENABLED: "開放功能",
  USER_DISABLED: "停用使用者帳號",
  USER_ENABLED: "啟用使用者帳號",
  WORKSPACE_REACTIVATED: "重新啟用工作區",
  WORKSPACE_SUSPENDED: "暫停工作區",
};

const auditTargetLabels: Record<string, string> = {
  user: "使用者帳號",
  workspace: "工作區",
  workspace_feature: "工作區功能",
};

export function auditActionLabel(value: string) {
  return auditActionLabels[value] ?? "平台設定變更";
}

export function auditTargetLabel(value: string) {
  return auditTargetLabels[value] ?? "平台資料";
}

/**
 * Every audit row is written in the same transaction as the change it
 * describes (or, where the deployment cannot run one, only after that change
 * succeeded), so a row exists only for a change that actually landed.
 */
export const auditResultLabel = "成功";

export function auditMetadataLabel(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return "—";
  const value = metadata as { enabled?: unknown; featureKey?: unknown };
  if (typeof value.featureKey === "string" && value.featureKey in featureLabels && typeof value.enabled === "boolean") {
    return `${featureLabel(value.featureKey)}已${value.enabled ? "開放" : "關閉"}`;
  }
  return "—";
}
