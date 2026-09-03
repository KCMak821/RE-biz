import type { Metadata } from "next";
import Link from "next/link";

import { ListCard } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { UserStatusButton } from "@/components/admin/user-status-button";
import { formatDate } from "@/lib/format";
import { listAdminUsers } from "@/lib/platform-admin";
import { roleLabel } from "@/lib/status";

export const metadata: Metadata = { title: "使用者｜RE-Biz 平台管理" };

export default async function UsersPage() {
  const users = await listAdminUsers();

  return (
    <div className="page page-wide">
      <PageHeader
        crumbs={[{ href: "/admin", label: "平台管理" }, { label: "使用者" }]}
        description="平台上的每個客戶帳號一列，含所屬公司數。平台管理者不是客戶帳號，不會出現在這裡。停用帳號只會阻止登入，既有資料與紀錄都會保留。"
        title="使用者"
      />
      <ListCard footer={users.length ? `共 ${users.length} 個帳號。` : undefined}>
        {users.length ? (
          <div className="admin-scroll">
            <table className="dtable">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>電子郵件</th>
                  <th className="is-end">所屬公司數</th>
                  <th>所屬公司</th>
                  <th>登入狀態</th>
                  <th>建立日期</th>
                  <th className="is-end">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name}</strong>
                    </td>
                    <td>{user.email}</td>
                    <td className="is-end">{user.workspaceCount}</td>
                    <td>
                      {user.workspaces.length
                        ? user.workspaces.map((workspace) => (
                            <div key={workspace.id}>
                              <Link className="dtable-row-link" href={`/admin/workspaces/${workspace.id}`}>
                                {workspace.name}
                              </Link>
                              <small>{roleLabel(workspace.role)}</small>
                            </div>
                          ))
                        : "—"}
                    </td>
                    <td>
                      <StatusBadge domain="account" value={user.accountStatus} />
                    </td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td className="is-end">
                      <UserStatusButton
                        currentStatus={user.accountStatus}
                        userId={user.id}
                        userName={user.name}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="還沒有任何使用者">
            <p>使用者完成註冊之後，會顯示在這裡。</p>
          </EmptyState>
        )}
      </ListCard>
    </div>
  );
}
