import type { Metadata } from "next";
import Link from "next/link";
import { ObjectId } from "mongodb";

import { ListCard } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { getWorkspaceUsage, listAdminWorkspaces } from "@/lib/platform-admin";

export const metadata: Metadata = { title: "使用量｜RE-Biz 平台管理" };

export default async function UsagePage() {
  const workspaces = await listAdminWorkspaces();
  const rows = await Promise.all(
    workspaces.map(async (workspace) => ({
      ...workspace,
      usage: await getWorkspaceUsage(new ObjectId(workspace.id)),
    })),
  );

  return (
    <div className="page page-wide">
      <PageHeader
        crumbs={[{ href: "/admin", label: "平台管理" }, { label: "使用量" }]}
        description="以目前資料即時計算每個工作區的收據、收支與報價單筆數，用來判斷使用情況與支援需求。"
        title="使用量"
      />
      <ListCard>
        {rows.length ? (
          <div className="admin-scroll">
            <table className="dtable">
              <thead>
                <tr>
                  <th>工作區</th>
                  <th className="is-end">收據</th>
                  <th className="is-end">收支紀錄</th>
                  <th className="is-end">報價單</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((workspace) => (
                  <tr key={workspace.id}>
                    <td>
                      <Link className="dtable-row-link" href={`/admin/workspaces/${workspace.id}`}>
                        {workspace.name}
                      </Link>
                    </td>
                    <td className="is-end">{workspace.usage.receipts.toLocaleString()}</td>
                    <td className="is-end">{workspace.usage.accountingRecords.toLocaleString()}</td>
                    <td className="is-end">{workspace.usage.quotations.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="還沒有可以統計的工作區">
            <p>建立第一個工作區之後，使用量會自動出現在這裡。</p>
          </EmptyState>
        )}
      </ListCard>
    </div>
  );
}
