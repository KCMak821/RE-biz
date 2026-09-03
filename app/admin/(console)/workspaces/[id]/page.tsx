import { notFound } from "next/navigation";

import { ListCard } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, Stat, Stats, SummaryList } from "@/components/app/surfaces";
import { SubscriptionControls } from "@/components/admin/subscription-controls";
import { WorkspaceControls } from "@/components/admin/workspace-controls";
import { formatDate, formatDateTime } from "@/lib/format";
import { getAdminWorkspace } from "@/lib/platform-admin";
import { planLabel, roleLabel } from "@/lib/status";
import { allowanceState, plans } from "@/lib/subscription";

export default async function WorkspaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getAdminWorkspace(id);
  if (!workspace) notFound();

  return (
    <div className="page page-wide">
      <PageHeader
        crumbs={[
          { href: "/admin", label: "平台管理" },
          { href: "/admin/workspaces", label: "工作區" },
          { label: workspace.name },
        ]}
        description="這個工作區的基本資料、成員與使用量。下方的管理操作會立即影響所有成員可以使用的功能。"
        status={<StatusBadge domain="workspace" value={workspace.status} withHint />}
        title={workspace.name}
      />

      <SummaryList
        items={[
          { label: "工作區 ID", value: workspace.id },
          { label: "建立時間", value: formatDateTime(workspace.createdAt) },
          { label: "擁有者", value: workspace.owner ? workspace.owner.name : "沒有可辨識的擁有者" },
          { label: "擁有者 Email", value: workspace.owner ? workspace.owner.email : "—" },
        ]}
      />

      <Stats>
        <Stat hint="這個工作區累計" label="收據" value={workspace.usage.receipts.toLocaleString()} />
        <Stat hint="這個工作區累計" label="收支紀錄" value={workspace.usage.accountingRecords.toLocaleString()} />
        <Stat hint="這個工作區累計" label="報價單" value={workspace.usage.quotations.toLocaleString()} />
      </Stats>

      <div style={{ marginTop: 18 }}>
        <Card
          description="這個公司付費方案的登記。變更方案不會改變成員可以使用的功能——那由上方的工作區狀態與功能開關決定。"
          title="訂閱"
        >
          <SummaryList
            items={[
              { label: "目前方案", value: planLabel(workspace.subscription.planKey) },
              { label: "訂閱狀態", value: <StatusBadge domain="subscription" value={workspace.subscription.status} /> },
              { label: "試用到期", value: workspace.subscription.trialEndsAt ? formatDate(workspace.subscription.trialEndsAt) : "無試用期" },
              { label: "本期到期", value: workspace.subscription.currentPeriodEnd ? formatDate(workspace.subscription.currentPeriodEnd) : "尚未開始收費" },
            ]}
          />
          <div style={{ marginTop: 14 }}>
            <h3 className="card-title" style={{ fontSize: 16, marginBottom: 10 }}>
              本月用量對照方案額度
            </h3>
            <div className="admin-feature-list">
              {/* Receipts and quotations are counted per month; members are a
                  standing headcount, so each says which it is. */}
              {([
                ["收據", "本月", workspace.usage.thisMonth.receipts, plans[workspace.subscription.planKey].allowances.receiptsPerMonth],
                ["報價單", "本月", workspace.usage.thisMonth.quotations, plans[workspace.subscription.planKey].allowances.quotationsPerMonth],
                ["成員", "目前", workspace.userCount, plans[workspace.subscription.planKey].allowances.members],
              ] as const).map(([label, period, used, allowance]) => {
                const state = allowanceState(used, allowance);
                return (
                  <div className="admin-feature-row" key={label}>
                    <div>
                      <strong>{label}</strong>
                      <span>
                        {state.allowance === null
                          ? `${period} ${used}，此方案不限量。`
                          : `${period} ${used} / ${state.allowance}`}
                      </span>
                    </div>
                    {state.over ? <StatusBadge domain="feature" value="disabled" /> : null}
                    {state.over ? <span className="badge-hint">已超出方案額度（目前不會阻擋）</span> : null}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <SubscriptionControls
              subscription={workspace.subscription}
              workspaceId={workspace.id}
              workspaceName={workspace.name}
            />
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 18 }}>
        <ListCard footer={`共 ${workspace.userCount} 位成員。`}>
          <div className="card-head">
            <div>
              <h2 className="card-title">成員</h2>
              <p className="card-desc">這個工作區的成員、角色，以及他們的登入狀態。</p>
            </div>
          </div>
          {workspace.members.length ? (
            <div className="admin-scroll">
              <table className="dtable">
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>電子郵件</th>
                    <th>角色</th>
                    <th>工作區狀態</th>
                    <th>登入狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.members.map((member) => (
                    <tr key={member.id}>
                      <td>
                        <strong>{member.name}</strong>
                      </td>
                      <td>{member.email}</td>
                      <td>{roleLabel(member.role)}</td>
                      <td>
                        <StatusBadge
                          domain="member"
                          value={member.status === "suspended" ? "suspended" : "active"}
                        />
                      </td>
                      <td>
                        <StatusBadge domain="account" value={member.accountStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="這個工作區還沒有成員">
              <p>擁有者新增成員後，他們的角色與狀態會顯示在這裡。</p>
            </EmptyState>
          )}
        </ListCard>
      </div>

      <div style={{ marginTop: 18 }}>
        <Card
          description="這些設定會立刻影響所有成員。資料不會被刪除，關閉的功能之後可以重新開放。"
          title="管理操作"
        >
          <WorkspaceControls
            features={workspace.features}
            status={workspace.status}
            workspaceId={workspace.id}
            workspaceName={workspace.name}
          />
        </Card>
      </div>
    </div>
  );
}
