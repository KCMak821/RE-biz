import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthBrand } from "@/components/features/auth/auth-brand";
import { SignOutButton } from "@/components/features/auth/sign-out-button";
import { ButtonLink } from "@/components/app/button";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "工作區已暫停｜RE-Biz" };

export default async function WorkspaceSuspendedPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/login");
  if (user.organization.status !== "suspended") redirect("/dashboard");

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <AuthBrand />
        <div className="auth-heading">
          <h1>這個工作區已被暫停</h1>
          <p>
            {user.organization.name} 目前已由平台管理者暫停，因此暫時無法查看或修改資料。
            所有既有的收據、報價單、請款單與記帳紀錄都完整保留，重新啟用後可以立即繼續使用。
          </p>
        </div>
        <p className="auth-status">請聯絡平台管理者了解原因並申請重新啟用。</p>
        {user.platformRole === "SUPER_ADMIN" ? (
          <div className="auth-form" style={{ marginTop: 18 }}>
            <ButtonLink block href="/admin/workspaces" variant="primary">
              前往平台管理處理
            </ButtonLink>
          </div>
        ) : null}
        <p className="auth-alt">
          <SignOutButton />
        </p>
      </section>
    </main>
  );
}
