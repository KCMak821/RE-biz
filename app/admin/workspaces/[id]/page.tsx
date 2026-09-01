import { notFound } from "next/navigation";

import { WorkspaceControls } from "@/components/admin/workspace-controls";
import { roleLabel, statusLabel } from "@/components/admin/presentation";
import { getAdminWorkspace } from "@/lib/platform-admin";

function formatDate(date: string) { return new Intl.DateTimeFormat("zh-HK", { dateStyle: "long", timeStyle: "short" }).format(new Date(date)); }

export default async function WorkspaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getAdminWorkspace(id);
  if (!workspace) notFound();
  return <>
    <div className="admin-page-heading"><div><p>Workspace 詳情</p><h1>{workspace.name}</h1><span>查看此 Workspace 的基本資料、成員與使用量。下方設定會直接影響所有成員的可用功能。</span></div><span className={`admin-status ${workspace.status}`}>{statusLabel(workspace.status)}</span></div>
    <div className="admin-detail-grid">
      <section className="admin-panel"><p>基本資料</p><dl><div><dt>Workspace 名稱</dt><dd>{workspace.name}</dd></div><div><dt>Workspace ID</dt><dd><code>{workspace.id}</code></dd></div><div><dt>建立時間</dt><dd>{formatDate(workspace.createdAt)}</dd></div><div><dt>狀態</dt><dd>{statusLabel(workspace.status)}</dd></div></dl></section>
      <section className="admin-panel"><p>擁有者</p>{workspace.owner ? <dl><div><dt>姓名</dt><dd>{workspace.owner.name}</dd></div><div><dt>電子郵件</dt><dd>{workspace.owner.email}</dd></div></dl> : <span className="admin-muted">沒有可辨識的擁有者。</span>}</section>
      <section className="admin-panel admin-usage-panel"><p>使用概況</p><div><strong>{workspace.usage.receipts}</strong><span>收據</span></div><div><strong>{workspace.usage.accountingRecords}</strong><span>收支紀錄</span></div><div><strong>{workspace.usage.quotations}</strong><span>報價單</span></div></section>
    </div>
    <section className="admin-section"><div className="admin-section-heading"><div><p>成員</p><h2>{workspace.userCount} 位啟用中的成員</h2></div></div>
      {!workspace.members.length ? <div className="admin-empty"><h2>此 Workspace 尚無成員</h2><p>擁有者新增成員後，角色與帳號狀態會顯示在這裡。</p></div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>姓名</th><th>電子郵件</th><th>角色</th><th>成員狀態</th><th>帳號狀態</th></tr></thead><tbody>{workspace.members.map((member) => <tr key={member.id}><td>{member.name}</td><td>{member.email}</td><td>{roleLabel(member.role)}</td><td><span className={`admin-status ${member.status}`}>{statusLabel(member.status)}</span></td><td><span className={`admin-status ${member.accountStatus}`}>{statusLabel(member.accountStatus)}</span></td></tr>)}</tbody></table></div>}
    </section>
    <WorkspaceControls features={workspace.features} status={workspace.status} workspaceId={workspace.id} />
  </>;
}
