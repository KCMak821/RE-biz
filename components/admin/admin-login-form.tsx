"use client";

import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/app/button";
import { Callout } from "@/components/app/feedback";
import { Field, FormActions, FormError } from "@/components/app/form";
import { request } from "@/lib/api";

export function AdminLoginForm({ expired }: { expired?: boolean }) {
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
      await request("/api/admin/auth/login", {
        body: JSON.stringify({ email: email.trim(), password }),
        method: "POST",
      });
      router.replace("/admin");
      router.refresh();
    } catch (error) {
      setPending(false);
      setMessage(error instanceof Error ? error.message : "無法登入，請稍後再試一次。");
    }
  }

  return (
    <>
      <div className="auth-heading">
        <h1>平台管理登入</h1>
        <p>這是 RE-Biz 的平台後台，只給營運團隊使用。客戶請改用一般登入頁。</p>
      </div>
      {expired ? (
        <Callout title="你已經被登出" tone="warning">
          <p>平台管理的登入狀態有效期較短，閒置後需要重新登入。</p>
        </Callout>
      ) : null}
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <Field
          autoComplete="email"
          label="管理者電子郵件"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="admin@re-biz.example"
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
            登入平台管理
          </Button>
        </FormActions>
      </form>
    </>
  );
}
