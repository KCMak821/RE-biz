import type { Metadata } from "next";

import { DashboardView } from "@/components/features/dashboard/dashboard-view";

export const metadata: Metadata = { title: "總覽｜RE-Biz" };

export default function DashboardPage() {
  return <DashboardView />;
}
