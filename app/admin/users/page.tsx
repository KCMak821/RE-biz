import Link from "next/link";

import { UserStatusButton } from "@/components/admin/user-status-button";
import { listAdminUsers } from "@/lib/platform-admin";

function formatDate(date: string) { return new Intl.DateTimeFormat("zh-HK", { dateStyle: "medium" }).format(new Date(date)); }

export default async function UsersPage() {
  const users = await listAdminUsers();
  return <>
    <div className="admin-page-heading"><div><p>USERS</p><h1>平台使用者</h1><span>每個 Workspace 歸屬各列一筆，方便確認跨 Workspace 的權限。停用帳號不會刪除既有資料。</span></div></div>
    {!users.length ? <section className="admin-empty"><h2>目前還沒有建立任何使用者</h2><p>使用者完成註冊後，會依 Workspace 歸屬顯示在這裡。</p></section> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>姓名</th><th>Email</th><th>Workspace</th><th>Workspace 角色</th><th>平台角色</th><th>帳號狀態</th><th>建立日期</th><th /></tr></thead><tbody>
      {users.map((user) => <tr key={`${user.id}-${user.workspace?.id ?? "none"}`}><td>{user.name}</td><td>{user.email}</td><td>{user.workspace ? <Link href={`/admin/workspaces/${user.workspace.id}`}>{user.workspace.name}</Link> : "—"}</td><td>{user.workspaceRole ?? "—"}</td><td>{user.platformRole}</td><td><span className={`admin-status ${user.accountStatus}`}>{user.accountStatus}</span></td><td>{formatDate(user.createdAt)}</td><td><UserStatusButton currentStatus={user.accountStatus} userId={user.id} /></td></tr>)}
    </tbody></table></div>}
  </>;
}
