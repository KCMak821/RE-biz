"use client";

import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/app/button";
import { Field, FormActions, FormError } from "@/components/app/form";
import { notify } from "@/components/app/toast";
import { request } from "@/lib/api";

export function ChangePasswordForm({
  currentLabel,
  onDone,
  submitLabel,
}: {
  currentLabel: string;
  /** Where to land afterwards. */
  onDone: string;
  submitLabel: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!current) found.current = "請輸入目前使用的密碼。";
    if (next.length < 12) found.next = "新密碼至少需要 12 個字元。";
    if (next !== repeat) found.repeat = "兩次輸入的新密碼不一致，請重新確認。";
    setErrors(found);
    if (Object.keys(found).length) return;

    setMessage("");
    setPending(true);
    try {
      await request("/api/auth/password", {
        body: JSON.stringify({ currentPassword: current, nextPassword: next }),
        method: "POST",
      });
      notify.success("密碼已更新", "下次登入請使用新密碼。");
      router.replace(onDone);
      router.refresh();
    } catch (error) {
      setPending(false);
      setMessage(error instanceof Error ? error.message : "無法更新密碼，請稍後再試一次。");
    }
  }

  return (
    <form className="auth-form" onSubmit={(event) => void submit(event)}>
      <Field
        autoComplete="current-password"
        error={errors.current}
        label={currentLabel}
        onChange={(event) => setCurrent(event.target.value)}
        required
        type="password"
        value={current}
      />
      <Field
        autoComplete="new-password"
        error={errors.next}
        hint="至少 12 個字元，只有你知道。"
        label="新密碼"
        onChange={(event) => setNext(event.target.value)}
        required
        type="password"
        value={next}
      />
      <Field
        autoComplete="new-password"
        error={errors.repeat}
        label="再次輸入新密碼"
        onChange={(event) => setRepeat(event.target.value)}
        required
        type="password"
        value={repeat}
      />
      <FormError>{message}</FormError>
      <FormActions>
        <Button
          icon={<KeyRound aria-hidden="true" size={16} />}
          pending={pending}
          pendingLabel="更新中…"
          type="submit"
          variant="primary"
        >
          {submitLabel}
        </Button>
      </FormActions>
    </form>
  );
}
