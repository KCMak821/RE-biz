import Link from "next/link";

import { getPlatformOverview } from "@/lib/platform-admin";

const labels = {
  activeWorkspaces: "Active Workspaces",
  totalAccountingRecords: "Total Accounting Records",
  totalQuotations: "Total Quotations",
  totalReceipts: "Total Receipts",
  totalUsers: "Total Users",
  totalWorkspaces: "Total Workspaces",
} as const;

export default async function AdminOverviewPage() {
  const overview = await getPlatformOverview();
  return <>
    <div className="admin-page-heading"><div><p>OVERVIEW</p><h1>Platform dashboard</h1><span>RE-Biz SaaS 的即時基礎營運統計。</span></div><Link className="admin-button" href="/admin/workspaces">查看 Workspaces</Link></div>
    <div className="admin-stats">
      {Object.entries(overview).map(([key, value]) => <article className="admin-stat" key={key}><span>{labels[key as keyof typeof labels]}</span><strong>{value.toLocaleString()}</strong></article>)}
    </div>
  </>;
}
