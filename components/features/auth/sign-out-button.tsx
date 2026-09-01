"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton({ label = "登出" }: { label?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <button className="btn btn-link" disabled={pending} onClick={() => void signOut()} type="button">
      {pending ? "登出中…" : label}
    </button>
  );
}
