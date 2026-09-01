"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function UserStatusButton({ currentStatus, userId }: { currentStatus: "active" | "disabled"; userId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const nextStatus = currentStatus === "active" ? "disabled" : "active";

  async function updateStatus() {
    if (nextStatus === "disabled" && !window.confirm("確定要停用此使用者帳號？\n停用後該使用者無法登入；既有 Workspace 資料與平台紀錄不會被刪除。")) return;
    setPending(true); setMessage("");
    const response = await fetch(`/api/admin/users/${userId}/status`, { body: JSON.stringify({ status: nextStatus }), headers: { "content-type": "application/json" }, method: "PATCH" });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) { setMessage(data.message ?? "無法更新帳號狀態。"); return; }
    router.refresh();
  }

  return <span className="admin-user-action"><button className={nextStatus === "disabled" ? "admin-table-danger" : ""} disabled={pending} type="button" onClick={() => void updateStatus()}>{pending ? "處理中…" : nextStatus === "disabled" ? "Disable" : "Enable"}</button>{message && <small role="status">{message}</small>}</span>;
}
