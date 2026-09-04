import type { Metadata } from "next";

import { FinancialReportView } from "@/components/features/reports/financial-report-view";

export const metadata: Metadata = { title: "財務報表｜RE-Biz" };

export default function ReportsPage() {
  return <FinancialReportView />;
}
