import { notFound } from "next/navigation";

import { WorkspaceControls } from "@/components/admin/workspace-controls";
import { getAdminWorkspace } from "@/lib/platform-admin";

function formatDate(date: string) { return new Intl.DateTimeFormat("zh-HK", { dateStyle: "long", timeStyle: "short" }).format(new Date(date)); }

export default async function WorkspaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getAdminWorkspace(id);
  if (!workspace) notFound();
  return <>
    <div className="admin-page-heading"><div><p>WORKSPACE DETAIL</p><h1>{workspace.name}</h1><span>查看此 Workspace 的基本資料、成員與使用量。下方設定會直接影響所有成員的可用功能。</span></div><span className={`admin-status ${workspace.status}`}>{workspace.status}</span></div>
    <div className="admin-detail-grid">
      <section className="admin-panel"><p>BASIC INFORMATION</p><dl><div><dt>Workspace Name</dt><dd>{workspace.name}</dd></div><div><dt>Workspace ID</dt><dd><code>{workspace.id}</code></dd></div><div><dt>Created At</dt><dd>{formatDate(workspace.createdAt)}</dd></div><div><dt>Status</dt><dd>{workspace.status}</dd></div></dl></section>
      <section className="admin-panel"><p>OWNER</p>{workspace.owner ? <dl><div><dt>Name</dt><dd>{workspace.owner.name}</dd></div><div><dt>Email</dt><dd>{workspace.owner.email}</dd></div></dl> : <span className="admin-muted">沒有可辨識的 owner。</span>}</section>
      <section className="admin-panel admin-usage-panel"><p>USAGE</p><div><strong>{workspace.usage.receipts}</strong><span>Receipts</span></div><div><strong>{workspace.usage.accountingRecords}</strong><span>Accounting records</span></div><div><strong>{workspace.usage.quotations}</strong><span>Quotations</span></div></section>
    </div>
    <section className="admin-section"><div className="admin-section-heading"><div><p>MEMBERS</p><h2>{workspace.userCount} 位啟用中的成員</h2></div></div>
      {!workspace.members.length ? <div className="admin-empty"><h2>此 Workspace 尚無成員</h2><p>擁有者新增成員後，角色與帳號狀態會顯示在這裡。</p></div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>姓名</th><th>Email</th><th>角色</th><th>成員狀態</th><th>帳號狀態</th></tr></thead><tbody>{workspace.members.map((member) => <tr key={member.id}><td>{member.name}</td><td>{member.email}</td><td>{member.role}</td><td><span className={`admin-status ${member.status}`}>{member.status}</span></td><td><span className={`admin-status ${member.accountStatus}`}>{member.accountStatus}</span></td></tr>)}</tbody></table></div>}
    </section>
    <WorkspaceControls features={workspace.features} status={workspace.status} workspaceId={workspace.id} />
  </>;
}
