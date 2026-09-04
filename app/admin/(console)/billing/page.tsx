import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";

import { ListCard } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Callout } from "@/components/app/feedback";
import { Card, Stat, Stats, SummaryList } from "@/components/app/surfaces";
import { formatDateTime } from "@/lib/format";
import { listStripeEvents, stripeIntegrationStatus } from "@/lib/platform-admin";

export const metadata: Metadata = { title: "金流串接｜RE-Biz 平台管理" };

const outcomes: Record<string, string> = {
  applied: "已更新公司訂閱",
  duplicate: "重複投遞，已略過",
  ignored: "已收到，但這個事件不需處理",
  no_match: "找不到對應公司",
};

export default async function BillingPage() {
  const [status, events] = await Promise.all([stripeIntegrationStatus(), listStripeEvents(20)]);
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const webhookUrl = host ? `${protocol}://${host}/api/stripe/webhook` : "/api/stripe/webhook";

  const ready = status.webhookSecretConfigured && status.plansMapped > 0 && status.linkedWorkspaces > 0;

  return (
    <div className="page page-wide">
      <PageHeader
        crumbs={[{ href: "/admin", label: "平台管理" }, { label: "金流串接" }]}
        description="Stripe 串接的狀態與診斷。金鑰設定在部署環境，這一頁不會顯示也不能修改它們。"
        title="金流串接"
      />

      {ready ? null : (
        <Callout title="還沒串完" tone="warning">
          <p>下面的四個步驟做完，Stripe 的訂閱狀態才會自動同步到這裡。目前還是可以用手動方式維護每間公司的訂閱。</p>
        </Callout>
      )}

      <Stats>
        <Stat
          hint={status.webhookSecretConfigured ? "STRIPE_WEBHOOK_SECRET 已設定" : "尚未設定，webhook 會一律拒收"}
          label="Webhook 金鑰"
          value={status.webhookSecretConfigured ? "已設定" : "未設定"}
        />
        <Stat
          hint={status.plansUnmapped.length ? `未對應：${status.plansUnmapped.join("、")}` : "所有啟用中的方案都已對應"}
          label="已對應 Stripe 價格的方案"
          value={String(status.plansMapped)}
        />
        <Stat
          hint={`共 ${status.totalWorkspaces} 間公司`}
          label="已連結 Stripe 客戶的公司"
          value={String(status.linkedWorkspaces)}
        />
        <Stat
          hint={status.lastEventAt ? "Stripe 有成功送達過" : "還沒收到任何通過驗證的事件"}
          label="最後收到事件"
          value={status.lastEventAt ? formatDateTime(status.lastEventAt) : "從未"}
        />
      </Stats>

      <Card description="依序完成這四步。前兩步在 Stripe 和部署環境設定，後兩步在這個後台。" title="串接步驟">
        <SummaryList
          items={[
            {
              label: "1. Webhook 網址",
              value: webhookUrl,
            },
            {
              label: "2. 簽章金鑰",
              value: status.webhookSecretConfigured
                ? "已設定"
                : "把 Stripe 的 Signing secret 設成部署環境的 STRIPE_WEBHOOK_SECRET，然後重新部署",
            },
            {
              label: "3. 方案對應價格",
              value: status.plansUnmapped.length
                ? `尚未對應：${status.plansUnmapped.join("、")}`
                : "全部完成",
            },
            {
              label: "4. 公司連結客戶",
              value: `${status.linkedWorkspaces} / ${status.totalWorkspaces} 間已填入 Stripe 客戶 ID`,
            },
          ]}
        />
        <p className="card-desc" style={{ marginTop: 12 }}>
          第 3 步在 <Link href="/admin/plans">方案與定價</Link> 貼上 Price ID；
          第 4 步在 <Link href="/admin/workspaces">工作區</Link> 各自的詳情頁貼上客戶 ID。
          沒有填客戶 ID 的公司，Stripe 的事件找不到它，也不會被動到。
        </p>
      </Card>

      <ListCard
        footer={
          events.length
            ? "只記錄通過簽章驗證的事件，保留 30 天。付款失敗只會把公司狀態記成「款項逾期」，不會自動暫停任何公司。"
            : undefined
        }
      >
        <div className="card-head">
          <div>
            <h2 className="card-title">最近收到的 Stripe 事件</h2>
            <p className="card-desc">用來確認 Stripe 有沒有真的送達，以及送來的事件有沒有被處理。</p>
          </div>
        </div>
        {events.length ? (
          <div className="admin-scroll">
            <table className="dtable">
              <thead>
                <tr>
                  <th>時間</th>
                  <th>事件類型</th>
                  <th>Stripe 客戶</th>
                  <th>結果</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      {formatDateTime(event.receivedAt)}
                      <small>{event.id}</small>
                    </td>
                    <td>{event.type}</td>
                    <td>{event.customerId ?? "—"}</td>
                    <td>
                      <StatusBadge
                        domain="feature"
                        value={event.outcome === "applied" ? "enabled" : "disabled"}
                      />
                      <small>{outcomes[event.outcome] ?? event.outcome}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="還沒收到任何 Stripe 事件">
            <p>
              在 Stripe 的 Webhooks 頁面把 endpoint 指向上面那個網址之後，可以按「Send test webhook」
              測一次，成功的話這裡就會出現一筆。
            </p>
          </EmptyState>
        )}
      </ListCard>
    </div>
  );
}
