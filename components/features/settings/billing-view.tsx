"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/app/button";
import { PageHeader } from "@/components/app/page-header";
import { useWorkspace } from "@/components/app/session";
import { Card, SummaryList } from "@/components/app/surfaces";
import { notify } from "@/components/app/toast";
import { request } from "@/lib/api";
import { status as statusDescriptor } from "@/lib/status";

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("zh-HK", { dateStyle: "long" }).format(new Date(value)) : "—";
}

export function BillingView() {
  const { isOwner, organization } = useWorkspace();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState<"checkout" | "portal" | null>(null);
  const subscription = organization.subscription;
  const checkoutResult = searchParams.get("checkout");
  const descriptor = statusDescriptor("subscription", subscription.status);

  async function redirectTo(endpoint: "/api/billing/checkout" | "/api/billing/portal", kind: "checkout" | "portal") {
    setPending(kind);
    try {
      const { url } = await request<{ url: string }>(endpoint, { method: "POST" });
      window.location.assign(url);
    } catch (error) {
      notify.error(kind === "checkout" ? "無法開啟付款頁面" : "無法開啟訂閱管理", error instanceof Error ? error.message : undefined);
      setPending(null);
    }
  }

  return (
    <div className="page">
      <PageHeader
        crumbs={[{ label: "設定" }, { label: "方案與帳單" }]}
        description="Plus 提供 30 天免費試用；開始時會安全地在 Stripe 收集付款方式，試用結束後才開始按月收費。"
        title="方案與帳單"
      />

      {checkoutResult === "success" ? <p className="next-step">已完成設定。Stripe 正在建立訂閱，這個頁面很快會更新為試用中。</p> : null}
      {checkoutResult === "cancelled" ? <p className="next-step">付款頁面已取消，沒有建立訂閱。</p> : null}

      <div className="dash-grid">
        <Card description="HK$50／月；先收付款方式，30 天後才首次扣款。" title="Plus">
          <SummaryList
            items={[
              { label: "目前狀態", value: descriptor.label },
              { label: "試用到期", value: date(subscription.trialEndsAt) },
              { label: "本期到期", value: date(subscription.currentPeriodEnd) },
            ]}
          />
          {isOwner ? (
            <div className="form-actions">
              {subscription.externalCustomerId ? (
                <Button onClick={() => void redirectTo("/api/billing/portal", "portal")} pending={pending === "portal"} pendingLabel="開啟中…" variant="primary">
                  管理訂閱
                </Button>
              ) : (
                <Button onClick={() => void redirectTo("/api/billing/checkout", "checkout")} pending={pending === "checkout"} pendingLabel="前往付款頁面…" variant="primary">
                  開始 30 天試用
                </Button>
              )}
            </div>
          ) : <p className="field-hint">只有公司擁有者可以開始或管理訂閱。</p>}
        </Card>

        <Card description="你的付款資料和取消設定都會在 Stripe 的安全頁面處理。" title="付款與取消">
          <p className="field-hint">取消會依 Customer Portal 的設定生效。建議設定為「在目前收費期結束時取消」，避免不必要的退款。</p>
        </Card>
      </div>
    </div>
  );
}
