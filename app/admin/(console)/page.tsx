import type { Metadata } from "next";
import Link from "next/link";

import { ButtonLink } from "@/components/app/button";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Card, Stat, Stats } from "@/components/app/surfaces";
import { auditActionLabel, auditMetadataLabel, auditResultLabel, auditTargetLabel } from "@/components/admin/presentation";
import { formatDateTime } from "@/lib/format";
import { getPlatformOverview } from "@/lib/platform-admin";

export const metadata: Metadata = { title: "平台總覽｜RE-Biz 平台管理" };

const cards = [
  { hint: "目前可正常使用的公司", key: "activeWorkspaces", label: "啟用中的公司" },
  { hint: "已暫停，資料保留可隨時恢復", key: "suspendedWorkspaces", label: "已暫停的公司" },
  { hint: "含已暫停的公司", key: "totalWorkspaces", label: "公司總數" },
  { hint: "所有公司的成員帳號", key: "totalUsers", label: "使用者總數" },
  { hint: "所有公司累計", key: "totalReceipts", label: "收據總數" },
  { hint: "所有公司累計", key: "totalQuotations", label: "報價單總數" },
  { hint: "所有公司累計", key: "totalAccountingRecords", label: "收支紀錄總數" },
] as const;

export default async function AdminOverviewPage() {
  const overview = await getPlatformOverview();

  return (
    <div className="page page-wide">
      <PageHeader
        description="全平台的公司、帳號與資料量概況。要暫停公司或開關個別功能，請從「工作區」進入詳情頁。"
        primaryAction={
          <ButtonLink href="/admin/workspaces" variant="primary">
            管理工作區
          </ButtonLink>
        }
        title="平台總覽"
      />
      <Stats>
        {cards.map((card) => (
          <Stat
            hint={card.hint}
            key={card.key}
            label={card.label}
            value={(overview[card.key] ?? 0).toLocaleString()}
          />
        ))}
      </Stats>

      <Card
        action={<Link className="btn btn-secondary btn-sm" href="/admin/audit-logs">查看全部</Link>}
        title="最近的後台操作"
      >
        {overview.recentAuditLogs.length ? (
          <div className="admin-scroll">
            <table className="dtable">
              <thead>
                <tr>
                  <th>時間</th>
                  <th>管理者</th>
                  <th>操作</th>
                  <th>目標</th>
                  <th>附加資訊</th>
                  <th>結果</th>
                </tr>
              </thead>
              <tbody>
                {overview.recentAuditLogs.map((log) => (
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
                    <td>{auditResultLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="還沒有後台操作紀錄">
            <p>當管理者暫停公司、開關功能或停用帳號後，最近幾筆會出現在這裡。</p>
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
