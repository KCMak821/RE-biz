"use client";

import { LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/app/button";
import { Callout } from "@/components/app/feedback";
import { Field, FormActions, FormError } from "@/components/app/form";
import { request } from "@/lib/api";

export function LoginForm({ expired }: { expired?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setPending(true);
    try {
      await request("/api/auth/login", {
        body: JSON.stringify({ email: email.trim(), password }),
        method: "POST",
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setPending(false);
      setMessage(error instanceof Error ? error.message : "無法登入，請稍後再試一次。");
    }
  }

  return (
    <>
      <div className="auth-heading">
        <h1>登入 RE-Biz</h1>
        <p>登入你的公司工作區，管理收據、收支、報價單與請款單。</p>
      </div>
      {expired ? (
        <Callout title="你已經被登出" tone="warning">
          <p>為了保護資料，閒置太久的登入狀態會失效。請重新登入後繼續。</p>
        </Callout>
      ) : null}
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <Field
          autoComplete="email"
          hint="使用建立帳號時填寫的工作 Email。"
          label="電子郵件"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          required
          type="email"
          value={email}
        />
        <Field
          autoComplete="current-password"
          label="密碼"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
        <FormError>{message}</FormError>
        <FormActions>
          <Button
            block
            icon={<LogIn aria-hidden="true" size={16} />}
            pending={pending}
            pendingLabel="登入中…"
            type="submit"
            variant="primary"
          >
            登入
          </Button>
        </FormActions>
      </form>
      <p className="auth-alt">
        還沒有工作區？<Link href="/register">建立你的公司帳號</Link>
      </p>
    </>
  );
}
