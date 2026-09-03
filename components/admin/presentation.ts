/**
 * Audit-log vocabulary. Status, role and feature labels now live in
 * `lib/status.ts` so the admin and the workspace use the same words.
 */
import { featureLabel, featureLabels, planLabel } from "@/lib/status";
import { status as statusDescriptor } from "@/lib/status";

const auditActionLabels: Record<string, string> = {
  SUBSCRIPTION_DATES_CHANGED: "調整訂閱日期",
  SUBSCRIPTION_PLAN_CHANGED: "變更訂閱方案",
  SUBSCRIPTION_STATUS_CHANGED: "變更訂閱狀態",
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

const attentionReasonLabels: Record<string, string> = {
  drift: "功能開關與方案不一致",
  past_due: "款項逾期",
  period_expired: "本期已到期",
  period_upcoming: "本期即將到期",
  trial_expired: "試用已到期",
  trial_upcoming: "試用即將到期",
};

export function attentionReasonLabel(value: string) {
  return attentionReasonLabels[value] ?? value;
}

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
  const value = metadata as {
    enabled?: unknown;
    featureKey?: unknown;
    fromPlan?: unknown;
    fromStatus?: unknown;
    toPlan?: unknown;
    toStatus?: unknown;
  };
  if (typeof value.featureKey === "string" && value.featureKey in featureLabels && typeof value.enabled === "boolean") {
    return `${featureLabel(value.featureKey)}已${value.enabled ? "開放" : "關閉"}`;
  }
  // Subscription changes record where they came from as well as where they
  // went, because "moved to 專業" is only half of what a billing question asks.
  const parts: string[] = [];
  if (typeof value.fromPlan === "string" && typeof value.toPlan === "string" && value.fromPlan !== value.toPlan) {
    parts.push(`方案 ${planLabel(value.fromPlan)} → ${planLabel(value.toPlan)}`);
  }
  if (typeof value.fromStatus === "string" && typeof value.toStatus === "string" && value.fromStatus !== value.toStatus) {
    parts.push(`狀態 ${statusDescriptor("subscription", value.fromStatus).label} → ${statusDescriptor("subscription", value.toStatus).label}`);
  }
  return parts.length ? parts.join("；") : "—";
}
