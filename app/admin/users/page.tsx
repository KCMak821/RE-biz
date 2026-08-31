import Link from "next/link";

import { UserStatusButton } from "@/components/admin/user-status-button";
import { listAdminUsers } from "@/lib/platform-admin";

function formatDate(date: string) { return new Intl.DateTimeFormat("zh-HK", { dateStyle: "medium" }).format(new Date(date)); }

export default async function UsersPage() {
  const users = await listAdminUsers();
  return <>
    <div className="admin-page-heading"><div><p>USERS</p><h1>Platform users</h1><span>每個 membership 都會列為一列，因此多個 Workspace 的歸屬不會被隱藏。</span></div></div>
    {!users.length ? <section className="admin-empty">尚未建立任何使用者。</section> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Workspace</th><th>Workspace Role</th><th>Platform Role</th><th>Account Status</th><th>Created At</th><th /></tr></thead><tbody>
      {users.map((user) => <tr key={`${user.id}-${user.workspace?.id ?? "none"}`}><td>{user.name}</td><td>{user.email}</td><td>{user.workspace ? <Link href={`/admin/workspaces/${user.workspace.id}`}>{user.workspace.name}</Link> : "—"}</td><td>{user.workspaceRole ?? "—"}</td><td>{user.platformRole}</td><td><span className={`admin-status ${user.accountStatus}`}>{user.accountStatus}</span></td><td>{formatDate(user.createdAt)}</td><td><UserStatusButton currentStatus={user.accountStatus} userId={user.id} /></td></tr>)}
    </tbody></table></div>}
  </>;
}
