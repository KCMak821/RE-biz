import Link from "next/link";
import { ObjectId } from "mongodb";

import { getWorkspaceUsage, listAdminWorkspaces } from "@/lib/platform-admin";

export default async function UsagePage() {
  const workspaces = await listAdminWorkspaces();
  const rows = await Promise.all(workspaces.map(async (workspace) => ({ ...workspace, usage: await getWorkspaceUsage(new ObjectId(workspace.id)) })));
  return <>
    <div className="admin-page-heading"><div><p>使用概況</p><h1>Workspace 使用概況</h1><span>以目前資料即時計算收據、收支與報價單數量，方便辨識使用量與後續支援需求。</span></div></div>
    {!rows.length ? <section className="admin-empty"><h2>目前沒有可統計的 Workspace</h2><p>建立第一個 Workspace 後，使用量會自動顯示在這裡。</p></section> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Workspace</th><th>收據</th><th>收支紀錄</th><th>報價單</th></tr></thead><tbody>
      {rows.map((workspace) => <tr key={workspace.id}><td><Link href={`/admin/workspaces/${workspace.id}`}>{workspace.name}</Link></td><td>{workspace.usage.receipts}</td><td>{workspace.usage.accountingRecords}</td><td>{workspace.usage.quotations}</td></tr>)}
    </tbody></table></div>}
  </>;
}
