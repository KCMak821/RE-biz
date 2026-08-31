import Link from "next/link";

import { listAdminWorkspaces } from "@/lib/platform-admin";

function formatDate(date: string) { return new Intl.DateTimeFormat("zh-HK", { dateStyle: "medium" }).format(new Date(date)); }

export default async function WorkspacesPage() {
  const workspaces = await listAdminWorkspaces();
  return <>
    <div className="admin-page-heading"><div><p>WORKSPACES</p><h1>Workspace management</h1><span>平台範圍的 Workspace 概要；不會改變既有 tenant isolation。</span></div></div>
    {!workspaces.length ? <section className="admin-empty">尚未建立任何 Workspace。</section> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Workspace Name</th><th>Workspace ID</th><th>Owner</th><th>User Count</th><th>Status</th><th>Created At</th><th /></tr></thead><tbody>
      {workspaces.map((workspace) => <tr key={workspace.id}><td><strong>{workspace.name}</strong></td><td><code>{workspace.id}</code></td><td>{workspace.owner ? <>{workspace.owner.name}<small>{workspace.owner.email}</small></> : "—"}</td><td>{workspace.userCount}</td><td><span className={`admin-status ${workspace.status}`}>{workspace.status}</span></td><td>{formatDate(workspace.createdAt)}</td><td><Link href={`/admin/workspaces/${workspace.id}`}>View</Link></td></tr>)}
    </tbody></table></div>}
  </>;
}
