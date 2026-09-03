import type { Metadata } from "next";
import Link from "next/link";

import { ButtonLink } from "@/components/app/button";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Card, Stat, Stats, SummaryList } from "@/components/app/surfaces";
import { attentionReasonLabel, auditActionLabel, auditMetadataLabel, auditResultLabel, auditTargetLabel } from "@/components/admin/presentation";
import { formatDateTime } from "@/lib/format";
import { getPlatformOverview } from "@/lib/platform-admin";
import { planLabel } from "@/lib/status";
import { planKeys, subscriptionStatuses } from "@/lib/subscription";
import { status as statusDescriptor } from "@/lib/status";

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
        action={<Link className="btn btn-secondary btn-sm" href="/admin/workspaces">查看工作區</Link>}
        description="到期日與方案落差都不會自動處理，需要人工判斷。這裡是待辦，不是警報。"
        title="需要留意的公司"
      >
        {overview.attention.length ? (
          <div className="admin-scroll">
            <table className="dtable">
              <thead>
                <tr>
                  <th>公司</th>
                  <th>方案</th>
                  <th>原因</th>
                </tr>
              </thead>
              <tbody>
                {overview.attention.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link className="dtable-row-link" href={`/admin/workspaces/${row.id}`}>
                        {row.name}
                      </Link>
                    </td>
                    <td>{planLabel(row.planKey)}</td>
                    <td>{row.reasons.map(attentionReasonLabel).join("；")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="目前沒有需要處理的訂閱">
            <p>試用即將到期、款項逾期，或功能開關與方案不一致的公司會出現在這裡。</p>
          </EmptyState>
        )}
      </Card>

      <Card
        description="方案與訂閱狀態目前只是登記，不會阻擋任何人使用。定價確定前，先用這裡看真實分佈。"
        title="訂閱分佈"
      >
        <div className="admin-feature-list">
          <div>
            <h3 className="card-title" style={{ fontSize: 16, marginBottom: 10 }}>
              依方案
            </h3>
            <SummaryList
              items={planKeys.map((key) => ({
                label: planLabel(key),
                value: `${overview.subscriptions.byPlan[key].toLocaleString()} 間公司`,
              }))}
            />
          </div>
          <div>
            <h3 className="card-title" style={{ fontSize: 16, marginBottom: 10 }}>
              依訂閱狀態
            </h3>
            <SummaryList
              items={subscriptionStatuses.map((state) => ({
                label: statusDescriptor("subscription", state).label,
                value: `${overview.subscriptions.byStatus[state].toLocaleString()} 間公司`,
              }))}
            />
          </div>
        </div>
      </Card>

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
