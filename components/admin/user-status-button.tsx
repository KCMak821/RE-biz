"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/app/button";
import { useConfirm } from "@/components/app/confirm";
import { notify } from "@/components/app/toast";
import { request } from "@/lib/api";

export function UserStatusButton({
  currentStatus,
  userId,
  userName,
}: {
  currentStatus: "active" | "disabled";
  userId: string;
  userName: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, setPending] = useState(false);
  const disabling = currentStatus === "active";

  async function updateStatus() {
    if (disabling) {
      const proceed = await confirm({
        confirmLabel: "停用帳號",
        consequence: `停用後，${userName} 無法登入 RE-Biz。他在各工作區的資料、文件與平台操作紀錄都會保留，之後可以隨時重新啟用。`,
        danger: true,
        title: `要停用 ${userName} 的帳號嗎？`,
      });
      if (!proceed) return;
    }

    setPending(true);
    try {
      await request(`/api/admin/users/${userId}/status`, {
        body: JSON.stringify({ status: disabling ? "disabled" : "active" }),
        method: "PATCH",
      });
      notify.success(disabling ? `${userName} 的帳號已停用` : `${userName} 的帳號已啟用`);
      router.refresh();
    } catch (error) {
      notify.error("無法更新帳號狀態", error instanceof Error ? error.message : undefined);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      onClick={() => void updateStatus()}
      pending={pending}
      pendingLabel="處理中…"
      size="sm"
      variant={disabling ? "secondary" : "primary"}
    >
      {disabling ? "停用帳號" : "重新啟用"}
    </Button>
  );
}
