import type { Metadata } from "next";

import { AccountView } from "@/components/features/settings/account-view";

export const metadata: Metadata = { title: "我的帳號｜RE-Biz" };

export default function AccountSettingsPage() {
  return <AccountView />;
}
