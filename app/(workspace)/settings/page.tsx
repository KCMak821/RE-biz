import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** `設定` is a group, not a page: send people to the first thing they can change. */
export default async function SettingsPage() {
  const user = await getCurrentUser().catch(() => null);
  const canManageSettings = user?.organization.role === "owner" || user?.organization.role === "admin";
  redirect(canManageSettings ? "/settings/company" : "/settings/account");
}
