import { notFound } from "next/navigation";

import { WorkspaceControls } from "@/components/admin/workspace-controls";
import { getAdminWorkspace } from "@/lib/platform-admin";

function formatDate(date: string) { return new Intl.DateTimeFormat("zh-HK", { dateStyle: "long", timeStyle: "short" }).format(new Date(date)); }

export default async function WorkspaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getAdminWorkspace(id);
  if (!workspace) notFound();
  return <>
    <div className="admin-page-heading"><div><p>WORKSPACE DETAIL</p><h1>{workspace.name}</h1><span>平台管理者可檢視概要，不會取得或修改客戶財務內容。</span></div><span className={`admin-status ${workspace.status}`}>{workspace.status}</span></div>
    <div className="admin-detail-grid">
      <section className="admin-panel"><p>BASIC INFORMATION</p><dl><div><dt>Workspace Name</dt><dd>{workspace.name}</dd></div><div><dt>Workspace ID</dt><dd><code>{workspace.id}</code></dd></div><div><dt>Created At</dt><dd>{formatDate(workspace.createdAt)}</dd></div><div><dt>Status</dt><dd>{workspace.status}</dd></div></dl></section>
      <section className="admin-panel"><p>OWNER</p>{workspace.owner ? <dl><div><dt>Name</dt><dd>{workspace.owner.name}</dd></div><div><dt>Email</dt><dd>{workspace.owner.email}</dd></div></dl> : <span className="admin-muted">沒有可辨識的 owner。</span>}</section>
      <section className="admin-panel admin-usage-panel"><p>USAGE</p><div><strong>{workspace.usage.receipts}</strong><span>Receipts</span></div><div><strong>{workspace.usage.accountingRecords}</strong><span>Accounting records</span></div><div><strong>{workspace.usage.quotations}</strong><span>Quotations</span></div></section>
    </div>
    <section className="admin-section"><div className="admin-section-heading"><div><p>MEMBERS</p><h2>{workspace.userCount} active member{workspace.userCount === 1 ? "" : "s"}</h2></div></div>
      {!workspace.members.length ? <div className="admin-empty">此 Workspace 尚無成員。</div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Membership Status</th><th>Account Status</th></tr></thead><tbody>{workspace.members.map((member) => <tr key={member.id}><td>{member.name}</td><td>{member.email}</td><td>{member.role}</td><td><span className={`admin-status ${member.status}`}>{member.status}</span></td><td><span className={`admin-status ${member.accountStatus}`}>{member.accountStatus}</span></td></tr>)}</tbody></table></div>}
    </section>
    <WorkspaceControls features={workspace.features} status={workspace.status} workspaceId={workspace.id} />
  </>;
}
