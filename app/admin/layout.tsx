import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getCurrentSuperAdmin } from "@/lib/platform-admin";

import "./admin.css";

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await getCurrentSuperAdmin();
  if (!user) redirect("/");

  return <main className="admin-shell">
    <header className="admin-topbar">
      <Link className="admin-brand" href="/admin">RE-Biz <span>平台管理</span></Link>
      <div className="admin-actor"><strong>{user.name}</strong><span>{user.email}</span></div>
    </header>
    <div className="admin-layout">
      <aside className="admin-sidebar" aria-label="平台管理導覽">
        <p>平台管理</p>
        <nav>
          <Link href="/admin">總覽</Link>
          <Link href="/admin/workspaces">Workspace 管理</Link>
          <Link href="/admin/users">使用者</Link>
          <Link href="/admin/usage">使用概況</Link>
          <Link href="/admin/audit-logs">操作紀錄</Link>
        </nav>
        <Link className="admin-back-link" href="/">← 返回工作區</Link>
      </aside>
      <section className="admin-content">{children}</section>
    </div>
  </main>;
}
