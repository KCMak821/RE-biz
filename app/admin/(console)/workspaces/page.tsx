import type { Metadata } from "next";
import Link from "next/link";

import { WorkspaceFilters } from "@/components/admin/admin-filters";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { formatDate } from "@/lib/format";
import { listAdminWorkspaces } from "@/lib/platform-admin";
import { status as statusDescriptor } from "@/lib/status";
import { listPlans, resolvePlan } from "@/lib/plans";
import { hasDrift, subscriptionStatuses } from "@/lib/subscription";

export const metadata: Metadata = { title: "工作區｜RE-Biz 平台管理" };

export default async function WorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; q?: string; subscription?: string }>;
}) {
  const { plan = "", q, subscription = "" } = await searchParams;
  const keyword = q?.trim() ?? "";
  const [workspaces, plans] = await Promise.all([
    listAdminWorkspaces({ keyword, planKey: plan, subscriptionStatus: subscription }),
    listPlans(),
  ]);
  const plansByKeyMap = new Map(plans.map((entry) => [entry.key, entry]));
  const filtered = Boolean(keyword || plan || subscription);

  return (
    <div className="page page-wide">
      <PageHeader
        crumbs={[{ href: "/admin", label: "平台管理" }, { label: "工作區" }]}
        description="每個公司的擁有者、成員數、使用量與狀態。進入詳情頁才能暫停公司或開關個別功能。"
        title="工作區"
      />
      <WorkspaceFilters
        action="/admin/workspaces"
        keyword={keyword}
        planKey={plan}
        planOptions={plans.map((entry) => ({
          label: entry.archived ? `${entry.label}（已封存）` : entry.label,
          value: entry.key,
        }))}
        resultLabel={filtered ? `符合條件的有 ${workspaces.length} 間` : undefined}
        statusOptions={subscriptionStatuses.map((key) => ({
          label: statusDescriptor("subscription", key).label,
          value: key,
        }))}
        subscriptionStatus={subscription}
      />
      <ListCard footer={workspaces.length && !filtered ? `共 ${workspaces.length} 間公司。` : undefined}>
        {workspaces.length ? (
          <div className="admin-scroll">
            <table className="dtable">
              <thead>
                <tr>
                  <th>名稱</th>
                  <th>擁有者</th>
                  <th>方案</th>
                  <th>訂閱</th>
                  <th className="is-end">成員數</th>
                  <th className="is-end">收據</th>
                  <th className="is-end">報價單</th>
                  <th className="is-end">收支紀錄</th>
                  <th>狀態</th>
                  <th>建立日期</th>
                  <th className="is-end">操作</th>
                </tr>
              </thead>
              <tbody>
                {workspaces.map((workspace) => (
                  <tr key={workspace.id}>
                    <td>
                      <Link className="dtable-row-link" href={`/admin/workspaces/${workspace.id}`}>
                        {workspace.name}
                      </Link>
                      <small>{workspace.id}</small>
                    </td>
                    <td>
                      {workspace.owner ? (
                        <>
                          {workspace.owner.name}
                          <small>{workspace.owner.email}</small>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {resolvePlan(plansByKeyMap, workspace.subscription.planKey).label}
                      {hasDrift(workspace.drift) ? <small>功能與方案不一致</small> : null}
                    </td>
                    <td>
                      <StatusBadge domain="subscription" value={workspace.subscription.status} />
                    </td>
                    <td className="is-end">{workspace.userCount}</td>
                    <td className="is-end">{workspace.usage.receipts.toLocaleString()}</td>
                    <td className="is-end">{workspace.usage.quotations.toLocaleString()}</td>
                    <td className="is-end">{workspace.usage.accountingRecords.toLocaleString()}</td>
                    <td>
                      <StatusBadge domain="workspace" value={workspace.status} />
                    </td>
                    <td>{formatDate(workspace.createdAt)}</td>
                    <td className="is-end">
                      <Link className="btn btn-secondary btn-sm" href={`/admin/workspaces/${workspace.id}`}>
                        查看詳情
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : filtered ? (
          <EmptyState title="沒有符合條件的公司">
            <p>試試只輸入公司名稱的一部分，或把方案與訂閱狀態改回「全部」。</p>
          </EmptyState>
        ) : (
          <EmptyState title="還沒有任何公司">
            <p>使用者完成註冊並建立公司之後，就會出現在這裡。</p>
          </EmptyState>
        )}
      </ListCard>
    </div>
  );
}
