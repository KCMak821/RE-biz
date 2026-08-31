"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Feature = { enabled: boolean; featureKey: "receipts" | "accounting" | "quotations" };

export function WorkspaceControls({ features, status, workspaceId }: { features: Feature[]; status: "active" | "suspended"; workspaceId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  async function updateStatus() {
    const nextStatus = status === "active" ? "suspended" : "active";
    if (nextStatus === "suspended" && !window.confirm("Suspend this workspace? Its data will be retained and its users will be blocked from workspace mutations.")) return;
    setPending("status"); setMessage("");
    const response = await fetch(`/api/admin/workspaces/${workspaceId}`, { body: JSON.stringify({ status: nextStatus }), headers: { "content-type": "application/json" }, method: "PATCH" });
    const data = await response.json().catch(() => ({}));
    setPending(null);
    if (!response.ok) { setMessage(data.message ?? "無法更新 Workspace 狀態。"); return; }
    setMessage(nextStatus === "suspended" ? "Workspace 已 suspended。" : "Workspace 已重新啟用。");
    router.refresh();
  }

  async function updateFeature(feature: Feature) {
    setPending(feature.featureKey); setMessage("");
    const response = await fetch(`/api/admin/workspaces/${workspaceId}/features/${feature.featureKey}`, { body: JSON.stringify({ enabled: !feature.enabled }), headers: { "content-type": "application/json" }, method: "PATCH" });
    const data = await response.json().catch(() => ({}));
    setPending(null);
    if (!response.ok) { setMessage(data.message ?? "無法更新功能開關。"); return; }
    setMessage(`${feature.featureKey} 已${feature.enabled ? "停用" : "啟用"}。`);
    router.refresh();
  }

  return <section className="admin-controls" aria-label="Workspace admin actions">
    <div className="admin-control-heading"><div><p>ADMIN ACTIONS</p><h2>Workspace state</h2></div><button className={status === "active" ? "admin-danger-button" : "admin-button"} disabled={pending === "status"} type="button" onClick={() => void updateStatus()}>{pending === "status" ? "處理中…" : status === "active" ? "Suspend Workspace" : "Reactivate Workspace"}</button></div>
    <div className="admin-control-heading"><div><p>FEATURE FLAGS</p><h2>Workspace capabilities</h2><span>功能關閉後，對應 API 會在伺服器端拒絕存取。</span></div></div>
    <div className="admin-feature-list">{features.map((feature) => <div key={feature.featureKey}><div><strong>{feature.featureKey}</strong><span>{feature.enabled ? "Enabled" : "Disabled"}</span></div><button disabled={pending === feature.featureKey} type="button" onClick={() => void updateFeature(feature)}>{pending === feature.featureKey ? "處理中…" : feature.enabled ? "Disable" : "Enable"}</button></div>)}</div>
    {message && <p className="admin-action-message" role="status">{message}</p>}
  </section>;
}
