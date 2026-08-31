import Link from "next/link";
import { ObjectId } from "mongodb";

import { getWorkspaceUsage, listAdminWorkspaces } from "@/lib/platform-admin";

export default async function UsagePage() {
  const workspaces = await listAdminWorkspaces();
  const rows = await Promise.all(workspaces.map(async (workspace) => ({ ...workspace, usage: await getWorkspaceUsage(new ObjectId(workspace.id)) })));
  return <>
    <div className="admin-page-heading"><div><p>USAGE</p><h1>Workspace usage</h1><span>直接從現有資料表 aggregate 計算，未建立 event pipeline 或 billing。</span></div></div>
    {!rows.length ? <section className="admin-empty">尚未有可統計的 Workspace。</section> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Workspace</th><th>Receipts</th><th>Accounting Records</th><th>Quotations</th></tr></thead><tbody>
      {rows.map((workspace) => <tr key={workspace.id}><td><Link href={`/admin/workspaces/${workspace.id}`}>{workspace.name}</Link></td><td>{workspace.usage.receipts}</td><td>{workspace.usage.accountingRecords}</td><td>{workspace.usage.quotations}</td></tr>)}
    </tbody></table></div>}
  </>;
}
