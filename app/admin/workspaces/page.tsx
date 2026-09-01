import Link from "next/link";

import { listAdminWorkspaces } from "@/lib/platform-admin";

function formatDate(date: string) { return new Intl.DateTimeFormat("zh-HK", { dateStyle: "medium" }).format(new Date(date)); }

export default async function WorkspacesPage() {
  const workspaces = await listAdminWorkspaces();
  return <>
    <div className="admin-page-heading"><div><p>WORKSPACES</p><h1>Workspace 管理</h1><span>查看各 Workspace 的擁有者、成員數與狀態。進入詳情後才能停用或調整可用功能。</span></div></div>
    {!workspaces.length ? <section className="admin-empty"><h2>目前還沒有建立任何 Workspace</h2><p>使用者完成註冊並建立公司後，Workspace 會顯示在這裡。</p></section> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>名稱</th><th>Workspace ID</th><th>擁有者</th><th>成員數</th><th>狀態</th><th>建立日期</th><th /></tr></thead><tbody>
      {workspaces.map((workspace) => <tr key={workspace.id}><td><strong>{workspace.name}</strong></td><td><code>{workspace.id}</code></td><td>{workspace.owner ? <>{workspace.owner.name}<small>{workspace.owner.email}</small></> : "—"}</td><td>{workspace.userCount}</td><td><span className={`admin-status ${workspace.status}`}>{workspace.status}</span></td><td>{formatDate(workspace.createdAt)}</td><td><Link href={`/admin/workspaces/${workspace.id}`}>查看詳情</Link></td></tr>)}
    </tbody></table></div>}
  </>;
}
