import type { Metadata } from "next";

import { CompanyForm } from "@/components/features/settings/company-form";

export const metadata: Metadata = { title: "公司資料｜RE-Biz" };

export default function CompanySettingsPage() {
  return <CompanyForm />;
}
