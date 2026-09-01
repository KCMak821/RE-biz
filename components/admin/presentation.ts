const featureLabels = {
  accounting: "收支記帳",
  invoices: "請款單",
  quotations: "報價單",
  receipts: "收據",
} as const;

const statusLabels: Record<string, string> = {
  active: "啟用中",
  disabled: "已停用",
  suspended: "已停用",
};

const roleLabels: Record<string, string> = {
  admin: "管理者",
  operator: "操作員",
  owner: "擁有者",
  viewer: "檢視者",
};

const platformRoleLabels: Record<string, string> = {
  SUPER_ADMIN: "平台管理者",
  USER: "一般使用者",
};

const auditActionLabels: Record<string, string> = {
  FEATURE_DISABLED: "停用功能",
  FEATURE_ENABLED: "啟用功能",
  USER_DISABLED: "停用使用者帳號",
  USER_ENABLED: "啟用使用者帳號",
  WORKSPACE_REACTIVATED: "重新啟用 Workspace",
  WORKSPACE_SUSPENDED: "停用 Workspace",
};

const auditTargetLabels: Record<string, string> = {
  user: "使用者帳號",
  workspace: "Workspace",
  workspace_feature: "Workspace 功能",
};

export function featureLabel(value: keyof typeof featureLabels) { return featureLabels[value]; }
export function statusLabel(value: string) { return statusLabels[value] ?? value; }
export function roleLabel(value: string) { return roleLabels[value] ?? value; }
export function platformRoleLabel(value: string) { return platformRoleLabels[value] ?? value; }
export function auditActionLabel(value: string) { return auditActionLabels[value] ?? "平台設定變更"; }
export function auditTargetLabel(value: string) { return auditTargetLabels[value] ?? "平台資料"; }

export function auditMetadataLabel(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return "—";
  const value = metadata as { enabled?: unknown; featureKey?: unknown };
  if (typeof value.featureKey === "string" && value.featureKey in featureLabels && typeof value.enabled === "boolean") {
    return `${featureLabel(value.featureKey as keyof typeof featureLabels)}已${value.enabled ? "啟用" : "停用"}`;
  }
  return "—";
}
