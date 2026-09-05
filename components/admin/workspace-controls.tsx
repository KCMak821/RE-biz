"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/app/button";
import { useConfirm } from "@/components/app/confirm";
import { StatusBadge } from "@/components/app/status-badge";
import { notify } from "@/components/app/toast";
import { request } from "@/lib/api";
import { featureLabel } from "@/lib/status";
import type { WorkspaceFeatureKey } from "@/lib/workspace-feature-keys";

type Feature = { enabled: boolean; featureKey: WorkspaceFeatureKey };

const featureConsequences: Record<Feature["featureKey"], string> = {
  accounting: "成員將無法查看或新增收支紀錄，餘額也不會再顯示。",
  exports: "成員將無法把報表或紀錄匯出成檔案下載，畫面上仍然看得到。",
  invoices: "成員將無法查看、建立或發送請款單。",
  quotations: "成員將無法查看或建立報價單、客戶與商品資料。",
  receipts: "成員將無法開立新收據，也看不到既有收據。",
};

export function WorkspaceControls({
  features,
  status,
  workspaceId,
  workspaceName,
}: {
  features: Feature[];
  status: "active" | "suspended";
  workspaceId: string;
  workspaceName: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, setPending] = useState<string | null>(null);

  async function updateStatus() {
    const suspending = status === "active";
    if (suspending) {
      const proceed = await confirm({
        confirmLabel: "暫停工作區",
        consequence: `暫停後，${workspaceName} 的所有成員登入時只會看到「工作區已暫停」的說明，無法查看或修改任何資料。所有資料完整保留，之後可以隨時重新啟用。`,
        danger: true,
        title: `要暫停 ${workspaceName} 嗎？`,
      });
      if (!proceed) return;
    }

    setPending("status");
    try {
      await request(`/api/admin/workspaces/${workspaceId}`, {
        body: JSON.stringify({ status: suspending ? "suspended" : "active" }),
        method: "PATCH",
      });
      notify.success(suspending ? `${workspaceName} 已暫停` : `${workspaceName} 已重新啟用`);
      router.refresh();
    } catch (error) {
      notify.error("無法更新工作區狀態", error instanceof Error ? error.message : undefined);
    } finally {
      setPending(null);
    }
  }

  async function updateFeature(feature: Feature) {
    if (feature.enabled) {
      const proceed = await confirm({
        confirmLabel: `關閉${featureLabel(feature.featureKey)}`,
        consequence: `${featureConsequences[feature.featureKey]}相關 API 也會在伺服器端拒絕存取。既有資料完整保留，之後可以重新開放。`,
        danger: true,
        title: `要關閉「${featureLabel(feature.featureKey)}」嗎？`,
      });
      if (!proceed) return;
    }

    setPending(feature.featureKey);
    try {
      await request(`/api/admin/workspaces/${workspaceId}/features/${feature.featureKey}`, {
        body: JSON.stringify({ enabled: !feature.enabled }),
        method: "PATCH",
      });
      notify.success(
        `${featureLabel(feature.featureKey)}已${feature.enabled ? "關閉" : "開放"}`,
        feature.enabled ? "成員現在無法使用這個功能。" : "成員重新整理後就可以使用。",
      );
      router.refresh();
    } catch (error) {
      notify.error("無法更新功能開關", error instanceof Error ? error.message : undefined);
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <div className="admin-feature-row" style={{ marginBottom: 18 }}>
        <div>
          <strong>工作區狀態</strong>
          <span>
            {status === "active"
              ? "成員可以正常使用這個工作區。"
              : "成員目前無法查看或修改任何資料，資料都已保留。"}
          </span>
        </div>
        <StatusBadge domain="workspace" value={status} />
        <Button
          onClick={() => void updateStatus()}
          pending={pending === "status"}
          pendingLabel="處理中…"
          size="sm"
          variant={status === "active" ? "danger" : "primary"}
        >
          {status === "active" ? "暫停工作區" : "重新啟用工作區"}
        </Button>
      </div>

      <h3 className="card-title" style={{ fontSize: 16, marginBottom: 10 }}>
        可用功能
      </h3>
      <div className="admin-feature-list">
        {features.map((feature) => (
          <div className="admin-feature-row" key={feature.featureKey}>
            <div>
              <strong>{featureLabel(feature.featureKey)}</strong>
              <span>{feature.enabled ? "成員可以正常使用。" : featureConsequences[feature.featureKey]}</span>
            </div>
            <StatusBadge domain="feature" value={feature.enabled ? "enabled" : "disabled"} />
            <Button
              onClick={() => void updateFeature(feature)}
              pending={pending === feature.featureKey}
              pendingLabel="處理中…"
              size="sm"
              variant={feature.enabled ? "secondary" : "primary"}
            >
              {feature.enabled ? "關閉功能" : "重新開放"}
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}
