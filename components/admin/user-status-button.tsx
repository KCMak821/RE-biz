"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function UserStatusButton({ currentStatus, userId }: { currentStatus: "active" | "disabled"; userId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const nextStatus = currentStatus === "active" ? "disabled" : "active";

  async function updateStatus() {
    if (nextStatus === "disabled" && !window.confirm("Disable this user account? Existing data will not be deleted.")) return;
    setPending(true); setMessage("");
    const response = await fetch(`/api/admin/users/${userId}/status`, { body: JSON.stringify({ status: nextStatus }), headers: { "content-type": "application/json" }, method: "PATCH" });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) { setMessage(data.message ?? "無法更新帳號狀態。"); return; }
    router.refresh();
  }

  return <span className="admin-user-action"><button className={nextStatus === "disabled" ? "admin-table-danger" : ""} disabled={pending} type="button" onClick={() => void updateStatus()}>{pending ? "處理中…" : nextStatus === "disabled" ? "Disable" : "Enable"}</button>{message && <small role="status">{message}</small>}</span>;
}
