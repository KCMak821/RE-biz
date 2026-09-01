import type { Metadata } from "next";
import Link from "next/link";

import { ListCard } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { UserStatusButton } from "@/components/admin/user-status-button";
import { formatDate } from "@/lib/format";
import { listAdminUsers } from "@/lib/platform-admin";
import { platformRoleLabel, roleLabel } from "@/lib/status";

export const metadata: Metadata = { title: "使用者｜RE-Biz 平台管理" };

export default async function UsersPage() {
  const users = await listAdminUsers();

  return (
    <div className="page page-wide">
      <PageHeader
        crumbs={[{ href: "/admin", label: "平台管理" }, { label: "使用者" }]}
        description="每個工作區歸屬各列一筆，方便確認跨工作區的權限。停用帳號只會阻止登入，既有資料與紀錄都會保留。"
        title="使用者"
      />
      <ListCard footer={users.length ? `共 ${users.length} 筆歸屬紀錄。` : undefined}>
        {users.length ? (
          <div className="admin-scroll">
            <table className="dtable">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>電子郵件</th>
                  <th>工作區</th>
                  <th>工作區角色</th>
                  <th>平台角色</th>
                  <th>登入狀態</th>
                  <th>建立日期</th>
                  <th className="is-end">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={`${user.id}-${user.workspace?.id ?? "none"}`}>
                    <td>
                      <strong>{user.name}</strong>
                    </td>
                    <td>{user.email}</td>
                    <td>
                      {user.workspace ? (
                        <Link className="dtable-row-link" href={`/admin/workspaces/${user.workspace.id}`}>
                          {user.workspace.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{user.workspaceRole ? roleLabel(user.workspaceRole) : "—"}</td>
                    <td>{platformRoleLabel(user.platformRole)}</td>
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
            <p>使用者完成註冊之後，會依所屬工作區顯示在這裡。</p>
          </EmptyState>
        )}
      </ListCard>
    </div>
  );
}
