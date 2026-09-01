import type { Metadata } from "next";

import { ListCard } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { auditActionLabel, auditMetadataLabel, auditTargetLabel } from "@/components/admin/presentation";
import { formatDateTime } from "@/lib/format";
import { listPlatformAuditLogs } from "@/lib/platform-admin";

export const metadata: Metadata = { title: "操作紀錄｜RE-Biz 平台管理" };

export default async function AuditLogsPage() {
  const auditLogs = await listPlatformAuditLogs();

  return (
    <div className="page page-wide">
      <PageHeader
        crumbs={[{ href: "/admin", label: "平台管理" }, { label: "操作紀錄" }]}
        description="平台管理者在後台做過的設定與狀態調整。只記錄必要的非敏感資訊。"
        title="操作紀錄"
      />
      <ListCard footer={auditLogs.length ? `顯示最近 ${auditLogs.length} 筆紀錄。` : undefined}>
        {auditLogs.length ? (
          <div className="admin-scroll">
            <table className="dtable">
              <thead>
                <tr>
                  <th>時間</th>
                  <th>管理者</th>
                  <th>操作</th>
                  <th>目標</th>
                  <th>附加資訊</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>
                      {log.actor ? (
                        <>
                          <strong>{log.actor.name}</strong>
                          <small>{log.actor.email}</small>
                        </>
                      ) : (
                        "未知管理者"
                      )}
                    </td>
                    <td>{auditActionLabel(log.action)}</td>
                    <td>
                      {auditTargetLabel(log.targetType)}
                      <small>{log.targetId}</small>
                    </td>
                    <td>{auditMetadataLabel(log.metadata)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="還沒有平台管理操作紀錄">
            <p>當管理者變更工作區狀態、開關功能或停用帳號後，紀錄會出現在這裡。</p>
          </EmptyState>
        )}
      </ListCard>
    </div>
  );
}
