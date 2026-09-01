"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { featureLabel } from "@/components/admin/presentation";

type Feature = { enabled: boolean; featureKey: "receipts" | "accounting" | "quotations" | "invoices" };

export function WorkspaceControls({ features, status, workspaceId }: { features: Feature[]; status: "active" | "suspended"; workspaceId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  async function updateStatus() {
    const nextStatus = status === "active" ? "suspended" : "active";
    if (nextStatus === "suspended" && !window.confirm("確定要停用此 Workspace？\n停用後所有成員無法修改此 Workspace 的資料；既有資料會保留，可稍後重新啟用。")) return;
    setPending("status"); setMessage("");
    const response = await fetch(`/api/admin/workspaces/${workspaceId}`, { body: JSON.stringify({ status: nextStatus }), headers: { "content-type": "application/json" }, method: "PATCH" });
    const data = await response.json().catch(() => ({}));
    setPending(null);
    if (!response.ok) { setMessage(data.message ?? "無法更新 Workspace 狀態。"); return; }
    setMessage(nextStatus === "suspended" ? "Workspace 已停用。" : "Workspace 已重新啟用。");
    router.refresh();
  }

  async function updateFeature(feature: Feature) {
    if (feature.enabled && !window.confirm(`確定要停用「${featureLabel(feature.featureKey)}」功能？\n停用後此 Workspace 的所有成員將無法使用對應功能與 API；資料會保留，之後可重新啟用。`)) return;
    setPending(feature.featureKey); setMessage("");
    const response = await fetch(`/api/admin/workspaces/${workspaceId}/features/${feature.featureKey}`, { body: JSON.stringify({ enabled: !feature.enabled }), headers: { "content-type": "application/json" }, method: "PATCH" });
    const data = await response.json().catch(() => ({}));
    setPending(null);
    if (!response.ok) { setMessage(data.message ?? "無法更新功能開關。"); return; }
    setMessage(`${featureLabel(feature.featureKey)}已${feature.enabled ? "停用" : "啟用"}。`);
    router.refresh();
  }

  return <section className="admin-controls" aria-label="Workspace 管理操作">
    <div className="admin-control-heading"><div><p>管理操作</p><h2>Workspace 狀態</h2></div><button className={status === "active" ? "admin-danger-button" : "admin-button"} disabled={pending === "status"} type="button" onClick={() => void updateStatus()}>{pending === "status" ? "處理中…" : status === "active" ? "停用 Workspace" : "重新啟用 Workspace"}</button></div>
    <div className="admin-control-heading"><div><p>功能開關</p><h2>Workspace 可用功能</h2><span>功能關閉後，對應 API 會在伺服器端拒絕存取。</span></div></div>
    <div className="admin-feature-list">{features.map((feature) => <div key={feature.featureKey}><div><strong>{featureLabel(feature.featureKey)}</strong><span>{feature.enabled ? "已啟用" : "已停用"}</span></div><button disabled={pending === feature.featureKey} type="button" onClick={() => void updateFeature(feature)}>{pending === feature.featureKey ? "處理中…" : feature.enabled ? "停用" : "啟用"}</button></div>)}</div>
    {message && <p className="admin-action-message" role="status">{message}</p>}
  </section>;
}
