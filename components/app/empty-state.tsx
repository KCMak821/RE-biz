import type { LucideIcon } from "lucide-react";
import { Inbox, Lock, SearchX } from "lucide-react";
import type { ReactNode } from "react";

/**
 * “沒有資料” is never enough. An empty screen has to say what happened, what
 * this feature is for, and what to do next — so the three reasons a list can be
 * empty each get their own shape.
 */
export function EmptyState({
  actions,
  children,
  icon: Icon = Inbox,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  icon?: LucideIcon;
  title: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon aria-hidden="true" size={22} />
      </span>
      <h3 className="empty-title">{title}</h3>
      <div className="empty-body">{children}</div>
      {actions ? <div className="empty-actions">{actions}</div> : null}
    </div>
  );
}

/** Nothing matched the current search or filter — the fix is to widen it. */
export function NoResults({ onReset }: { onReset: () => void }) {
  return (
    <EmptyState
      actions={
        <button className="btn btn-secondary btn-sm" onClick={onReset} type="button">
          清除搜尋與篩選
        </button>
      }
      icon={SearchX}
      title="找不到符合條件的資料"
    >
      <p>目前的搜尋文字或狀態篩選沒有比對到任何紀錄。清除條件就會看到全部資料。</p>
    </EmptyState>
  );
}

/** A platform admin switched this feature off for the workspace. */
export function FeatureDisabled({ feature, message }: { feature: string; message?: string }) {
  return (
    <EmptyState icon={Lock} title={`${feature}目前未開放給這個工作區`}>
      <p>{message ?? `${feature}已由平台管理者關閉，因此看不到任何資料，也無法新增。`}</p>
      <p>如果你需要使用這個功能，請聯絡平台管理者重新開放。既有資料都已保留。</p>
    </EmptyState>
  );
}

/** The role can read but not write. Say so before they hunt for a missing button. */
export function ReadOnlyNotice({ children }: { children: ReactNode }) {
  return <p className="readonly-notice">{children}</p>;
}
