import type { Metadata } from "next";

import { ReceiptTemplateForm } from "@/components/features/settings/receipt-template-form";

export const metadata: Metadata = { title: "收據樣式｜RE-Biz" };

export default function ReceiptTemplateSettingsPage() {
  return <ReceiptTemplateForm />;
}
