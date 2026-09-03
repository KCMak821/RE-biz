import { Search } from "lucide-react";
import Link from "next/link";

/**
 * Filter controls for the platform admin lists.
 *
 * The admin pages are server components that read `searchParams` directly, so
 * these are plain GET forms rather than the workspace app's controlled
 * `ListToolbar`: no client bundle, no fetch-on-keystroke, and every filtered
 * view is a shareable URL that support can paste into a ticket.
 */
export function AdminSearchForm({
  action,
  keyword,
  label,
  placeholder,
  resultLabel,
}: {
  action: string;
  keyword: string;
  label: string;
  placeholder: string;
  resultLabel?: string;
}) {
  return (
    <form action={action} className="toolbar no-print" method="get">
      <div className="toolbar-search">
        <label className="sr-only" htmlFor="admin-search">
          {label}
        </label>
        <Search aria-hidden="true" size={15} />
        <input
          className="control"
          defaultValue={keyword}
          id="admin-search"
          name="q"
          placeholder={placeholder}
          type="search"
        />
      </div>
      <div className="toolbar-meta">
        {resultLabel ? <span className="toolbar-count">{resultLabel}</span> : null}
        <button className="btn btn-secondary btn-sm" type="submit">
          搜尋
        </button>
        {keyword ? (
          <Link className="toolbar-reset" href={action}>
            清除條件
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export function WorkspaceFilters({
  action,
  keyword,
  planKey,
  planOptions,
  resultLabel,
  statusOptions,
  subscriptionStatus,
}: {
  action: string;
  keyword: string;
  planKey: string;
  planOptions: Array<{ label: string; value: string }>;
  resultLabel?: string;
  statusOptions: Array<{ label: string; value: string }>;
  subscriptionStatus: string;
}) {
  const filtered = Boolean(keyword || planKey || subscriptionStatus);
  return (
    <form action={action} className="toolbar no-print" method="get">
      <div className="toolbar-search">
        <label className="sr-only" htmlFor="workspace-search">
          搜尋公司
        </label>
        <Search aria-hidden="true" size={15} />
        <input
          className="control"
          defaultValue={keyword}
          id="workspace-search"
          name="q"
          placeholder="公司名稱、擁有者、方案或 ID"
          type="search"
        />
      </div>
      <div className="toolbar-filters">
        <div className="toolbar-select">
          <label htmlFor="workspace-plan">方案</label>
          <select className="control control-select" defaultValue={planKey} id="workspace-plan" name="plan">
            <option value="">全部方案</option>
            {planOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="toolbar-select">
          <label htmlFor="workspace-subscription">訂閱狀態</label>
          <select className="control control-select" defaultValue={subscriptionStatus} id="workspace-subscription" name="subscription">
            <option value="">全部狀態</option>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="toolbar-meta">
        {resultLabel ? <span className="toolbar-count">{resultLabel}</span> : null}
        <button className="btn btn-secondary btn-sm" type="submit">
          套用
        </button>
        {filtered ? (
          <Link className="toolbar-reset" href={action}>
            清除條件
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export function AuditLogFilters({
  action,
  from,
  resultLabel,
  to,
  workspaceId,
  workspaces,
}: {
  action: string;
  from: string;
  resultLabel?: string;
  to: string;
  workspaceId: string;
  workspaces: Array<{ id: string; name: string }>;
}) {
  const filtered = Boolean(from || to || workspaceId);
  return (
    <form action={action} className="toolbar no-print" method="get">
      <div className="toolbar-filters">
        <div className="toolbar-select">
          <label htmlFor="audit-from">起始日期</label>
          <input className="control" defaultValue={from} id="audit-from" name="from" type="date" />
        </div>
        <div className="toolbar-select">
          <label htmlFor="audit-to">結束日期</label>
          <input className="control" defaultValue={to} id="audit-to" name="to" type="date" />
        </div>
        <div className="toolbar-select">
          <label htmlFor="audit-workspace">公司</label>
          <select className="control control-select" defaultValue={workspaceId} id="audit-workspace" name="workspaceId">
            <option value="">全部公司</option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="toolbar-meta">
        {resultLabel ? <span className="toolbar-count">{resultLabel}</span> : null}
        <button className="btn btn-secondary btn-sm" type="submit">
          套用篩選
        </button>
        {filtered ? (
          <Link className="toolbar-reset" href={action}>
            清除條件
          </Link>
        ) : null}
      </div>
    </form>
  );
}
