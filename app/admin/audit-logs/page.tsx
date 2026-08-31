import { listPlatformAuditLogs } from "@/lib/platform-admin";

function formatDate(date: string) { return new Intl.DateTimeFormat("zh-HK", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(date)); }

export default async function AuditLogsPage() {
  const auditLogs = await listPlatformAuditLogs();
  return <>
    <div className="admin-page-heading"><div><p>AUDIT LOGS</p><h1>Platform audit trail</h1><span>僅儲存平台管理行為與非敏感 metadata。</span></div></div>
    {!auditLogs.length ? <section className="admin-empty">尚未有平台管理操作紀錄。</section> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Target</th><th>Metadata</th></tr></thead><tbody>
      {auditLogs.map((log) => <tr key={log.id}><td>{formatDate(log.createdAt)}</td><td>{log.actor ? <>{log.actor.name}<small>{log.actor.email}</small></> : "Unknown admin"}</td><td><code>{log.action}</code></td><td>{log.targetType}<small>{log.targetId}</small></td><td>{log.metadata ? <code>{JSON.stringify(log.metadata)}</code> : "—"}</td></tr>)}
    </tbody></table></div>}
  </>;
}
