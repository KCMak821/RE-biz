"use client";

import { UserPlus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/app/button";
import { Field, FormActions, FormError, FormNote, SelectField } from "@/components/app/form";
import { request } from "@/lib/api";

/**
 * Two steps, because asking for a person and a company on one screen is what
 * made the original form feel like a tax return. Step 1 is the account; step 2
 * is the company, and everything optional there is clearly marked.
 */
export function RegisterForm() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [timeZone, setTimeZone] = useState("Asia/Hong_Kong");
  const [currency, setCurrency] = useState("HKD");
  const [businessRegistration, setBusinessRegistration] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  function continueToCompany(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "請輸入你的姓名。";
    if (!email.trim()) next.email = "請輸入你的工作 Email。";
    if (password.length < 12) next.password = "密碼至少需要 12 個字元。";
    if (password !== passwordRepeat) next.passwordRepeat = "兩次輸入的密碼不一致，請重新確認。";
    setErrors(next);
    if (Object.keys(next).length) return;
    setMessage("");
    setStep(2);
  }

  function selectLogo(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/svg+xml"].includes(file.type) || file.size > 1_000_000) {
      setMessage("Logo 只支援 PNG、JPG 或 SVG，且檔案需小於 1 MB。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
    setMessage("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!companyName.trim()) {
      setErrors({ companyName: "請輸入公司或商號名稱，它會印在你的收據與報價單上。" });
      return;
    }
    setErrors({});
    setMessage("");
    setPending(true);
    try {
      await request("/api/auth/register", {
        body: JSON.stringify({
          address,
          businessRegistration,
          companyName,
          contact,
          currency,
          email: email.trim(),
          logoDataUrl: logoDataUrl || undefined,
          name: name.trim(),
          password,
          timeZone,
        }),
        method: "POST",
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setPending(false);
      setMessage(error instanceof Error ? error.message : "無法建立公司帳號，請稍後再試一次。");
    }
  }

  return (
    <>
      <p aria-label={`第 ${step} 步，共 2 步`} className="auth-steps">
        <b className={step === 1 ? "is-current" : "is-done"}>1</b>
        <i />
        <b className={step === 2 ? "is-current" : undefined}>2</b>
        <span>{step === 1 ? "建立你的登入帳號" : "設定公司資料"}</span>
      </p>

      {step === 1 ? (
        <>
          <div className="auth-heading">
            <h1>建立你的帳號</h1>
            <p>你會成為這個公司工作區的擁有者，之後可以自行新增同事並設定他們的權限。</p>
          </div>
          <form className="auth-form" onSubmit={continueToCompany}>
            <Field
              autoComplete="name"
              error={errors.name}
              label="姓名"
              onChange={(event) => setName(event.target.value)}
              placeholder="陳大文"
              required
              value={name}
            />
            <Field
              autoComplete="email"
              error={errors.email}
              hint="之後用這個 Email 登入。"
              label="工作 Email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              required
              type="email"
              value={email}
            />
            <Field
              autoComplete="new-password"
              error={errors.password}
              hint="至少 12 個字元。建議使用一句只有你記得的話。"
              label="密碼"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            <Field
              autoComplete="new-password"
              error={errors.passwordRepeat}
              label="再次輸入密碼"
              onChange={(event) => setPasswordRepeat(event.target.value)}
              required
              type="password"
              value={passwordRepeat}
            />
            <FormError>{message}</FormError>
            <FormActions>
              <Button block type="submit" variant="primary">
                下一步：設定公司資料
              </Button>
            </FormActions>
          </form>
          <p className="auth-alt">
            已經有帳號了？<Link href="/login">回到登入</Link>
          </p>
        </>
      ) : (
        <>
          <div className="auth-heading">
            <h1>設定公司資料</h1>
            <p>這些資料會印在你的收據、報價單與請款單上。除了公司名稱以外都可以稍後在「設定 → 公司資料」補上。</p>
          </div>
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            <Field
              error={errors.companyName}
              hint="會作為文件抬頭，例如：RE Company Limited。"
              label="公司／商號名稱"
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="RE Company Limited"
              required
              value={companyName}
            />
            <div className="field">
              <span className="field-label-row">
                <span className="field-label">公司 Logo</span>
                <em className="field-optional">選填</em>
              </span>
              <div className="logo-picker">
                {logoDataUrl ? (
                  <Image alt="Logo 預覽" height={44} src={logoDataUrl} unoptimized width={44} />
                ) : null}
                <span>PNG、JPG 或 SVG，小於 1 MB。會印在收據左上角。</span>
                <input
                  accept="image/png,image/jpeg,image/svg+xml"
                  onChange={(event) => selectLogo(event.target.files?.[0])}
                  type="file"
                />
              </div>
            </div>
            <SelectField
              hint="影響日期顯示與收據編號的日期。"
              label="地區與時區"
              onChange={(event) => setTimeZone(event.target.value)}
              value={timeZone}
            >
              <option value="Asia/Hong_Kong">香港（GMT+8）</option>
              <option value="Asia/Taipei">台灣（GMT+8）</option>
              <option value="UTC">UTC</option>
            </SelectField>
            <SelectField
              hint="所有金額會以這個幣別顯示。"
              label="幣別"
              onChange={(event) => setCurrency(event.target.value)}
              value={currency}
            >
              <option value="HKD">HKD 港幣</option>
              <option value="TWD">TWD 新台幣</option>
              <option value="USD">USD 美元</option>
            </SelectField>
            <Field
              label="商業登記號碼"
              onChange={(event) => setBusinessRegistration(event.target.value)}
              placeholder="12345678"
              value={businessRegistration}
            />
            <Field
              label="公司地址"
              onChange={(event) => setAddress(event.target.value)}
              placeholder="香港九龍…"
              value={address}
            />
            <Field
              hint="電話或 Email，會印在文件上供客戶聯絡。"
              label="聯絡方式"
              onChange={(event) => setContact(event.target.value)}
              placeholder="+852 1234 5678 · hello@example.com"
              value={contact}
            />
            <FormError>{message}</FormError>
            <FormActions>
              <Button onClick={() => setStep(1)} variant="ghost">
                上一步
              </Button>
              <Button
                icon={<UserPlus aria-hidden="true" size={16} />}
                pending={pending}
                pendingLabel="建立中…"
                type="submit"
                variant="primary"
              >
                建立公司並開始使用
              </Button>
            </FormActions>
            <FormNote>建立後你會直接進入工作區，第一件事通常是開立一張收據或建立一張報價單。</FormNote>
          </form>
        </>
      )}
    </>
  );
}
