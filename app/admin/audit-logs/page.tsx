import { listPlatformAuditLogs } from "@/lib/platform-admin";

function formatDate(date: string) { return new Intl.DateTimeFormat("zh-HK", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(date)); }

export default async function AuditLogsPage() {
  const auditLogs = await listPlatformAuditLogs();
  return <>
    <div className="admin-page-heading"><div><p>AUDIT LOGS</p><h1>平台操作紀錄</h1><span>查看管理者在平台後台進行的設定與狀態調整；僅記錄非敏感的必要資訊。</span></div></div>
    {!auditLogs.length ? <section className="admin-empty"><h2>目前還沒有平台管理操作紀錄</h2><p>當管理者變更 Workspace 或帳號狀態後，紀錄會顯示在這裡。</p></section> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>時間</th><th>管理者</th><th>操作</th><th>目標</th><th>附加資訊</th></tr></thead><tbody>
      {auditLogs.map((log) => <tr key={log.id}><td>{formatDate(log.createdAt)}</td><td>{log.actor ? <>{log.actor.name}<small>{log.actor.email}</small></> : "Unknown admin"}</td><td><code>{log.action}</code></td><td>{log.targetType}<small>{log.targetId}</small></td><td>{log.metadata ? <code>{JSON.stringify(log.metadata)}</code> : "—"}</td></tr>)}
    </tbody></table></div>}
  </>;
}
