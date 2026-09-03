import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { getCurrentSuperAdmin } from "@/lib/platform-admin";

import "../admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "平台管理登入｜RE-Biz" };

/**
 * A separate door from the product's /login. Customers sign in to their company
 * workspace; this is for the people who run RE-Biz, and the two use different
 * accounts and different cookies.
 */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  let unavailable = false;
  try {
    if (await getCurrentSuperAdmin()) redirect("/admin");
  } catch {
    unavailable = true;
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="admin-marker">平台管理</span>
        </div>
        {unavailable ? (
          <>
            <div className="auth-heading">
              <h1>暫時無法連線</h1>
              <p>系統無法連上資料庫，因此不能登入。這通常是暫時的，請稍後重新整理頁面再試一次。</p>
            </div>
            <p className="auth-status">如果情況持續，請確認資料庫連線設定。</p>
          </>
        ) : (
          <AdminLoginForm expired={reason === "expired"} />
        )}
      </section>
    </main>
  );
}
