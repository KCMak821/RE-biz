import { notFound } from "next/navigation";

import { ListCard } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, Stat, Stats, SummaryList } from "@/components/app/surfaces";
import { WorkspaceControls } from "@/components/admin/workspace-controls";
import { formatDateTime } from "@/lib/format";
import { getAdminWorkspace } from "@/lib/platform-admin";
import { roleLabel } from "@/lib/status";

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
