"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminSignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <button className="shell-signout" disabled={pending} onClick={() => void signOut()} type="button">
      <LogOut aria-hidden="true" size={14} />
      {pending ? "登出中…" : "登出"}
    </button>
  );
}
