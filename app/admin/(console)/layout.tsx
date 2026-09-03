import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminNav } from "@/components/admin/admin-nav";
import { AdminSignOutButton } from "@/components/admin/admin-sign-out-button";
import { ConfirmProvider } from "@/components/app/confirm";
import { getCurrentSuperAdmin } from "@/lib/platform-admin";

import "../admin.css";

export const dynamic = "force-dynamic";

/**
 * The platform back office. It shares the application's shell and components,
 * with one clear marker so you always know which side you are on.
 *
 * Access is decided here, on the server, and again in every /api/admin route:
 * a customer who types the URL is redirected before any markup is produced.
 * Platform admins are their own identity with their own cookie, so no customer
 * session — not even a company owner's — can satisfy this guard.
 */
export default async function AdminConsoleLayout({ children }: Readonly<{ children: ReactNode }>) {
  const admin = await getCurrentSuperAdmin();
  if (!admin) redirect("/admin/login");

  return (
    <ConfirmProvider>
      <div className="shell is-admin">
        <header className="shell-topbar no-print">
          <Link className="brand" href="/admin">
            <Image alt="" className="brand-mark" height={30} priority src="/re-biz-mark.svg" width={30} />
            <span className="brand-name">RE-Biz</span>
          </Link>
          <span className="admin-marker">平台管理</span>
          <div className="shell-identity">
            <span className="shell-user">
              {admin.name}
              <em>平台管理者</em>
            </span>
            <AdminSignOutButton />
          </div>
        </header>
        <div className="shell-body">
          <aside aria-label="平台管理導覽" className="shell-sidebar no-print">
            <AdminNav />
          </aside>
          <main className="shell-main">{children}</main>
        </div>
      </div>
    </ConfirmProvider>
  );
}
