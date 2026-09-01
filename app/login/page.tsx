import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthBrand } from "@/components/features/auth/auth-brand";
import { LoginForm } from "@/components/features/auth/login-form";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "登入｜RE-Biz" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  let user = null;
  let unavailable = false;
  try {
    user = await getCurrentUser();
  } catch {
    unavailable = true;
  }
  if (user) redirect("/dashboard");

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <AuthBrand />
        {unavailable ? (
          <>
            <div className="auth-heading">
              <h1>暫時無法連線</h1>
              <p>系統無法連上資料庫，因此不能登入。這通常是暫時的，請稍後重新整理頁面再試一次。</p>
            </div>
            <p className="auth-status">如果情況持續，請聯絡系統管理者確認資料庫連線設定。</p>
          </>
        ) : (
          <LoginForm expired={reason === "expired"} />
        )}
      </section>
    </main>
  );
}
