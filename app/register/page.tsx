import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthBrand } from "@/components/features/auth/auth-brand";
import { RegisterForm } from "@/components/features/auth/register-form";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "建立公司帳號｜RE-Biz" };

export default async function RegisterPage() {
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect("/dashboard");

  return (
    <main className="auth-shell">
      <section className="auth-card auth-card-wide">
        <AuthBrand />
        <RegisterForm />
      </section>
    </main>
  );
}
