import type { Metadata } from "next";

import { NewPlanForm, PlanEditor } from "@/components/admin/plan-controls";
import { ListCard } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { formatPlanPrice, listPlans } from "@/lib/plans";
import { planUsageCounts } from "@/lib/platform-admin";
import { featureLabel } from "@/lib/status";

export const metadata: Metadata = { title: "方案與定價｜RE-Biz 平台管理" };

function allowanceText(value: number | null) {
  return value === null ? "不限" : value.toLocaleString();
}

export default async function PlansPage() {
  const [plans, usage] = await Promise.all([listPlans(), planUsageCounts()]);

  return (
    <div className="page page-wide">
      <PageHeader
        crumbs={[{ href: "/admin", label: "平台管理" }, { label: "方案與定價" }]}
        description="方案存在資料庫裡，改價格或額度不需要改程式。額度目前只用來標示與比對，不會阻擋任何人使用。"
        primaryAction={<NewPlanForm />}
        title="方案與定價"
      />
      <ListCard
        footer={
          plans.length
            ? "調整價格只影響之後新指派這個方案的公司；既有公司記錄的價格不會被改寫。"
            : undefined
        }
      >
        {plans.length ? (
          <div className="admin-scroll">
            <table className="dtable">
              <thead>
                <tr>
                  <th>方案</th>
                  <th className="is-end">月費</th>
                  <th className="is-end">收據／月</th>
                  <th className="is-end">報價單／月</th>
                  <th className="is-end">成員</th>
                  <th>包含功能</th>
                  <th>Stripe Price</th>
                  <th className="is-end">使用中公司</th>
                  <th>狀態</th>
                  <th className="is-end">操作</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.key}>
                    <td>
                      <strong>{plan.label}</strong>
                      <small>{plan.key}</small>
                      {plan.description ? <small>{plan.description}</small> : null}
                    </td>
                    <td className="is-end">{formatPlanPrice(plan.priceCents, plan.currency)}</td>
                    <td className="is-end">{allowanceText(plan.allowances.receiptsPerMonth)}</td>
                    <td className="is-end">{allowanceText(plan.allowances.quotationsPerMonth)}</td>
                    <td className="is-end">{allowanceText(plan.allowances.members)}</td>
                    <td>{plan.features.length ? plan.features.map(featureLabel).join("、") : "—"}</td>
                    <td>{plan.stripePriceId ?? "尚未對應"}</td>
                    <td className="is-end">{(usage[plan.key] ?? 0).toLocaleString()}</td>
                    <td>
                      <StatusBadge domain="feature" value={plan.archived ? "disabled" : "enabled"} />
                      {plan.isDefault ? <small>新公司的預設方案</small> : null}
                    </td>
                    <td className="is-end">
                      <PlanEditor plan={plan} workspaceCount={usage[plan.key] ?? 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="還沒有任何方案">
            <p>建立第一個方案之後，就可以在工作區詳情頁把公司指派過去。</p>
          </EmptyState>
        )}
      </ListCard>
    </div>
  );
}
