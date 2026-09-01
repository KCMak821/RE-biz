import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminNav } from "@/components/admin/admin-nav";
import { ConfirmProvider } from "@/components/app/confirm";
import { getCurrentSuperAdmin } from "@/lib/platform-admin";

import "./admin.css";

export const dynamic = "force-dynamic";

/**
 * The platform admin used to look like a different product — dark navy chrome,
 * a blue accent, its own badge styles. It now shares the app's shell and
 * components, with one clear marker so you always know which side you are on.
 */
export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await getCurrentSuperAdmin();
  if (!user) redirect("/");

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
              {user.name}
              <em>平台管理者</em>
            </span>
            <Link className="shell-signout" href="/dashboard">
              <ArrowLeft aria-hidden="true" size={14} />
              返回我的工作區
            </Link>
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
