import Link from "next/link";

import { getPlatformOverview } from "@/lib/platform-admin";

const labels = {
  activeWorkspaces: "啟用中的 Workspace",
  totalAccountingRecords: "收支紀錄總數",
  totalQuotations: "報價單總數",
  totalReceipts: "收據總數",
  totalUsers: "使用者總數",
  totalWorkspaces: "Workspace 總數",
} as const;

export default async function AdminOverviewPage() {
  const overview = await getPlatformOverview();
  return <>
    <div className="admin-page-heading"><div><p>平台總覽</p><h1>管理者後台</h1><span>查看全平台的 Workspace、帳號與資料量概況；請從 Workspace 管理進入個別設定。</span></div><Link className="admin-button" href="/admin/workspaces">查看 Workspace</Link></div>
    <div className="admin-stats">
      {Object.entries(overview).map(([key, value]) => <article className="admin-stat" key={key}><span>{labels[key as keyof typeof labels]}</span><strong>{value.toLocaleString()}</strong></article>)}
    </div>
  </>;
}
