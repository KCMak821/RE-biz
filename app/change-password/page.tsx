import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthBrand } from "@/components/features/auth/auth-brand";
import { ChangePasswordForm } from "@/components/features/auth/change-password-form";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "設定新密碼｜RE-Biz" };

/** Forced on first sign-in with an administrator-issued temporary password. */
export default async function ChangePasswordPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/dashboard");

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <AuthBrand />
        <div className="auth-heading">
          <h1>先設定你自己的密碼</h1>
          <p>
            你現在使用的是管理者提供的暫用密碼。設定一組只有你知道的新密碼之後，就可以開始使用
            {user.organization.name} 的工作區。
          </p>
        </div>
        <ChangePasswordForm currentLabel="目前的暫用密碼" onDone="/dashboard" submitLabel="設定新密碼並開始使用" />
      </section>
    </main>
  );
}
