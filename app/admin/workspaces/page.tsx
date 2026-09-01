import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { formatDate } from "@/lib/format";
import { listAdminWorkspaces } from "@/lib/platform-admin";

export const metadata: Metadata = { title: "工作區｜RE-Biz 平台管理" };

export default async function WorkspacesPage() {
  const workspaces = await listAdminWorkspaces();

  return (
    <div className="page page-wide">
      <PageHeader
        crumbs={[{ href: "/admin", label: "平台管理" }, { label: "工作區" }]}
        description="每個工作區的擁有者、成員數與狀態。進入詳情頁才能暫停工作區或開關個別功能。"
        title="工作區"
      />
      <ListCard footer={workspaces.length ? `共 ${workspaces.length} 個工作區。` : undefined}>
        {workspaces.length ? (
          <div className="admin-scroll">
            <table className="dtable">
              <thead>
                <tr>
                  <th>名稱</th>
                  <th>擁有者</th>
                  <th className="is-end">成員數</th>
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
                    <td className="is-end">{workspace.userCount}</td>
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
        ) : (
          <EmptyState title="還沒有任何工作區">
            <p>使用者完成註冊並建立公司之後，工作區就會出現在這裡。</p>
          </EmptyState>
        )}
      </ListCard>
    </div>
  );
}
