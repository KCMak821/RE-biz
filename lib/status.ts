/**
 * Every status label and colour in RE-Biz, in one place.
 *
 * Before this module the same state was written four different ways: quotes and
 * invoices used pill badges, receipts used bare coloured text, members used a
 * third style, and the platform admin had its own palette. Worse, a deactivated
 * item borrowed the “rejected quote” red. One table, one vocabulary.
 */

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "muted";

export type StatusDescriptor = { label: string; tone: Tone; hint?: string };

const quote: Record<string, StatusDescriptor> = {
  draft: { hint: "尚未發送給客戶，可以繼續編輯。", label: "草稿", tone: "neutral" },
  sent: { hint: "已送出，等待客戶回覆接受或拒絕。", label: "已發送", tone: "info" },
  accepted: { hint: "客戶已接受。可以轉為請款單，或直接開收據，兩者擇一。", label: "已接受", tone: "success" },
  rejected: { hint: "客戶已拒絕，這張報價單不會再往下走。", label: "已拒絕", tone: "danger" },
  expired: { hint: "已發送但過了有效期限，不能再變更狀態。需要重新報價請複製為新草稿。", label: "已失效", tone: "warning" },
};

const invoice: Record<string, StatusDescriptor> = {
  draft: { hint: "尚未發送給客戶，可以繼續編輯。", label: "草稿", tone: "neutral" },
  unpaid: { hint: "已發送，尚未收到款項。", label: "未付款", tone: "info" },
  overdue: { hint: "已超過到期日仍未付款。", label: "已逾期", tone: "danger" },
  partially_paid: { hint: "已收到部分款項。", label: "部分付款", tone: "warning" },
  paid: { hint: "款項已全數收到。", label: "已付款", tone: "success" },
  void: { hint: "已作廢，保留紀錄但不應再向客戶請款。", label: "已作廢", tone: "muted" },
};

const receipt: Record<string, StatusDescriptor> = {
  pending: { hint: "由報價單建立的草稿收據，確認收款後才會列入收入。", label: "待收款", tone: "warning" },
  paid: { hint: "已確認收款，已列入收支紀錄。", label: "已收款", tone: "success" },
};

const customer: Record<string, StatusDescriptor> = {
  active: { label: "啟用中", tone: "success" },
  archived: { hint: "不會出現在新文件的客戶選單，歷史文件不受影響。", label: "已封存", tone: "muted" },
};

const item: Record<string, StatusDescriptor> = {
  active: { label: "啟用中", tone: "success" },
  inactive: { hint: "不會出現在報價單的品項選單，歷史文件不受影響。", label: "已下架", tone: "muted" },
};

const member: Record<string, StatusDescriptor> = {
  active: { label: "可使用", tone: "success" },
  pending_password: { hint: "已建立帳號，等待成員首次登入並設定自己的密碼。", label: "待設定密碼", tone: "warning" },
  suspended: { hint: "無法使用此工作區，資料與紀錄保留。", label: "已停權", tone: "muted" },
};

const workspace: Record<string, StatusDescriptor> = {
  active: { label: "啟用中", tone: "success" },
  suspended: { hint: "所有成員無法修改資料，可隨時重新啟用。", label: "已暫停", tone: "danger" },
};

const account: Record<string, StatusDescriptor> = {
  active: { label: "可登入", tone: "success" },
  disabled: { hint: "無法登入，既有資料與紀錄保留。", label: "已停用", tone: "muted" },
};

const ledger: Record<string, StatusDescriptor> = {
  IN: { label: "收入", tone: "success" },
  OUT: { label: "支出", tone: "danger" },
};

const feature: Record<string, StatusDescriptor> = {
  enabled: { label: "已開放", tone: "success" },
  disabled: { label: "已關閉", tone: "muted" },
};

const subscription: Record<string, StatusDescriptor> = {
  trialing: { hint: "試用期間，尚未開始收費。", label: "試用中", tone: "info" },
  active: { hint: "訂閱正常。", label: "訂閱中", tone: "success" },
  past_due: { hint: "款項逾期。目前不會自動停用，需要人工處理。", label: "款項逾期", tone: "warning" },
  canceled: { hint: "已取消訂閱，資料保留。", label: "已取消", tone: "muted" },
};

const registry = { account, customer, feature, invoice, item, ledger, member, quote, receipt, subscription, workspace };

export type StatusDomain = keyof typeof registry;

export function status(domain: StatusDomain, value: string | undefined | null): StatusDescriptor {
  return registry[domain][value ?? ""] ?? { label: value || "—", tone: "neutral" };
}



/* ---------------------------------------------------------------- vocabulary */

export const roleLabels = {
  admin: "管理者",
  operator: "操作員",
  owner: "擁有者",
  viewer: "檢視者",
} as const;

export const roleDescriptions = {
  admin: "可處理日常資料，並管理公司設定與成員。",
  operator: "可建立與編輯日常資料，不能變更公司設定。",
  owner: "工作區的擁有者，擁有全部權限。",
  viewer: "只能查看資料，不能新增或修改。",
} as const;

export function roleLabel(role: string | undefined | null) {
  return roleLabels[role as keyof typeof roleLabels] ?? role ?? "—";
}

export const featureLabels = {
  accounting: "收支紀錄",
  exports: "匯出下載",
  invoices: "請款單",
  quotations: "報價單",
  receipts: "收據",
} as const;

export function featureLabel(key: string) {
  return featureLabels[key as keyof typeof featureLabels] ?? key;
}
