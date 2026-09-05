import type { Metadata } from "next";

import { BillingView } from "@/components/features/settings/billing-view";

export const metadata: Metadata = { title: "方案與帳單｜RE-Biz" };

export default function BillingSettingsPage() {
  return <BillingView />;
}
