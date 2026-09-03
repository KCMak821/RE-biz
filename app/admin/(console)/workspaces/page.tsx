import type { Metadata } from "next";
import Link from "next/link";

import { AdminSearchForm } from "@/components/admin/admin-filters";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { formatDate } from "@/lib/format";
import { listAdminWorkspaces } from "@/lib/platform-admin";

export const metadata: Metadata = { title: "工作區｜RE-Biz 平台管理" };

export default async function WorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const keyword = q?.trim() ?? "";
  const workspaces = await listAdminWorkspaces({ keyword });

  return (
    <div className="page page-wide">
      <PageHeader
        crumbs={[{ href: "/admin", label: "平台管理" }, { label: "工作區" }]}
        description="每個公司的擁有者、成員數、使用量與狀態。進入詳情頁才能暫停公司或開關個別功能。"
        title="工作區"
      />
      <AdminSearchForm
        action="/admin/workspaces"
        keyword={keyword}
        label="搜尋公司"
        placeholder="公司名稱、擁有者或 ID"
        resultLabel={keyword ? `符合「${keyword}」的有 ${workspaces.length} 個` : undefined}
      />
      <ListCard footer={workspaces.length && !keyword ? `共 ${workspaces.length} 個公司。` : undefined}>
        {workspaces.length ? (
          <div className="admin-scroll">
            <table className="dtable">
              <thead>
                <tr>
                  <th>名稱</th>
                  <th>擁有者</th>
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
        ) : keyword ? (
          <EmptyState title={`沒有符合「${keyword}」的公司`}>
            <p>試試只輸入公司名稱的一部分，或改用擁有者的電子郵件搜尋。</p>
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
