"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/app/button";
import { useConfirm } from "@/components/app/confirm";
import { notify } from "@/components/app/toast";
import { request } from "@/lib/api";
import type { Plan } from "@/lib/plan-types";
import { subscriptionStatuses, type PlanKey, type SubscriptionStatus, type WorkspaceSubscription } from "@/lib/subscription";
import { status as statusDescriptor } from "@/lib/status";

/**
 * Recording what a company pays for. Changing a plan here grants and removes
 * nothing on its own — access is still decided by the workspace status and the
 * feature switches above — so the confirm copy says so rather than implying an
 * entitlement change that will not happen.
 */
export function SubscriptionControls({
  plans,
  subscription,
  workspaceId,
  workspaceName,
}: {
  /** Assignable plans, newest pricing included. Archived ones are not offered. */
  plans: Plan[];
  subscription: WorkspaceSubscription;
  workspaceId: string;
  workspaceName: string;
}) {
  const planByKey = new Map(plans.map((plan) => [plan.key, plan]));
  const planLabel = (key: string) => planByKey.get(key)?.label ?? key;
  // Archived plans are withdrawn from new assignments, but a company already on
  // one keeps it listed — otherwise saving an unrelated field would silently
  // move them onto a different plan.
  const assignable = plans.filter((plan) => !plan.archived || plan.key === subscription.planKey);
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, setPending] = useState(false);
  const [planKey, setPlanKey] = useState<PlanKey>(subscription.planKey);
  const [state, setState] = useState<SubscriptionStatus>(subscription.status);
  const [trialEndsAt, setTrialEndsAt] = useState(subscription.trialEndsAt?.slice(0, 10) ?? "");
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState(subscription.currentPeriodEnd?.slice(0, 10) ?? "");
  const [customerId, setCustomerId] = useState(subscription.externalCustomerId ?? "");

  const dirty =
    planKey !== subscription.planKey ||
    state !== subscription.status ||
    trialEndsAt !== (subscription.trialEndsAt?.slice(0, 10) ?? "") ||
    currentPeriodEnd !== (subscription.currentPeriodEnd?.slice(0, 10) ?? "") ||
    customerId !== (subscription.externalCustomerId ?? "");

  async function save() {
    if (planKey !== subscription.planKey) {
      const proceed = await confirm({
        confirmLabel: "變更方案",
        consequence:
          `${workspaceName} 的方案會從「${planLabel(subscription.planKey)}」改為「${planLabel(planKey)}」，並記錄在操作紀錄中。` +
          "這只是帳務上的登記：成員可以使用的功能不會因此改變，仍由上方的功能開關與工作區狀態決定。",
        title: `要把 ${workspaceName} 改成「${planLabel(planKey)}」嗎？`,
      });
      if (!proceed) return;
    }

    setPending(true);
    try {
      await request(`/api/admin/workspaces/${workspaceId}/subscription`, {
        body: JSON.stringify({
          currentPeriodEnd: currentPeriodEnd || null,
          externalCustomerId: customerId.trim() || null,
          planKey,
          status: state,
          trialEndsAt: trialEndsAt || null,
        }),
        method: "PATCH",
      });
      notify.success("訂閱資料已更新");
      router.refresh();
    } catch (error) {
      notify.error("無法更新訂閱資料", error instanceof Error ? error.message : undefined);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="admin-feature-list">
      <div className="admin-feature-row">
        <div>
          <strong>方案</strong>
          <span>{planByKey.get(planKey)?.description ?? "這個方案已不在提供中。"}</span>
        </div>
        <div className="toolbar-select">
          <label className="sr-only" htmlFor="subscription-plan">
            方案
          </label>
          <select
            className="control control-select"
            id="subscription-plan"
            onChange={(event) => setPlanKey(event.target.value as PlanKey)}
            value={planKey}
          >
            {assignable.map((plan) => (
              <option key={plan.key} value={plan.key}>
                {plan.archived ? `${plan.label}（已封存）` : plan.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="admin-feature-row">
        <div>
          <strong>訂閱狀態</strong>
          <span>{statusDescriptor("subscription", state).hint ?? "目前的收費狀態。"}</span>
        </div>
        <div className="toolbar-select">
          <label className="sr-only" htmlFor="subscription-status">
            訂閱狀態
          </label>
          <select
            className="control control-select"
            id="subscription-status"
            onChange={(event) => setState(event.target.value as SubscriptionStatus)}
            value={state}
          >
            {subscriptionStatuses.map((key) => (
              <option key={key} value={key}>
                {statusDescriptor("subscription", key).label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="admin-feature-row">
        <div>
          <strong>試用到期日</strong>
          <span>留空表示沒有試用期。到期不會自動暫停，需要人工處理。</span>
        </div>
        <div className="toolbar-select">
          <label className="sr-only" htmlFor="subscription-trial">
            試用到期日
          </label>
          <input
            className="control"
            id="subscription-trial"
            onChange={(event) => setTrialEndsAt(event.target.value)}
            type="date"
            value={trialEndsAt}
          />
        </div>
      </div>

      <div className="admin-feature-row">
        <div>
          <strong>本期到期日</strong>
          <span>留空表示尚未開始收費。同樣不會自動處理。</span>
        </div>
        <div className="toolbar-select">
          <label className="sr-only" htmlFor="subscription-period">
            本期到期日
          </label>
          <input
            className="control"
            id="subscription-period"
            onChange={(event) => setCurrentPeriodEnd(event.target.value)}
            type="date"
            value={currentPeriodEnd}
          />
        </div>
      </div>

      <div className="admin-feature-row">
        <div>
          <strong>Stripe 客戶 ID</strong>
          <span>
            填入後，Stripe 的訂閱事件才找得到這間公司並自動更新訂閱狀態。留空則完全由人工維護。
            {subscription.externalSubscriptionId
              ? `目前的訂閱：${subscription.externalSubscriptionId}。`
              : ""}
          </span>
        </div>
        <div className="toolbar-select">
          <label className="sr-only" htmlFor="subscription-customer">
            Stripe 客戶 ID
          </label>
          <input
            className="control"
            id="subscription-customer"
            onChange={(event) => setCustomerId(event.target.value)}
            placeholder="cus_..."
            value={customerId}
          />
        </div>
      </div>

      <div>
        <Button
          disabled={!dirty}
          onClick={() => void save()}
          pending={pending}
          pendingLabel="儲存中…"
          size="sm"
          variant="primary"
        >
          儲存訂閱資料
        </Button>
      </div>
    </div>
  );
}
