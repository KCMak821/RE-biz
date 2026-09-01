"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/app/button";
import { useUnsavedChanges } from "@/components/app/dirty-guard";
import { Callout } from "@/components/app/feedback";
import {
  Field,
  FormActions,
  FormError,
  FormGrid,
  FormNote,
  FormSection,
  TextareaField,
} from "@/components/app/form";
import { PageHeader } from "@/components/app/page-header";
import { useWorkspace } from "@/components/app/session";
import { notify } from "@/components/app/toast";
import { request } from "@/lib/api";
import { help } from "@/lib/help-content";

/** Exactly the seven keys `/api/organization/profile` accepts. */
type CompanyProfile = {
  address: string;
  bankDetails: string;
  businessRegistration: string;
  contact: string;
  email: string;
  name: string;
  phone: string;
};

export function CompanyForm() {
  const { canManageSettings, organization } = useWorkspace();
  const router = useRouter();

  const [profile, setProfile] = useState<CompanyProfile>({
    address: organization.address,
    bankDetails: organization.bankDetails,
    businessRegistration: organization.businessRegistration,
    contact: organization.contact,
    email: organization.email,
    name: organization.name,
    phone: organization.phone,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useUnsavedChanges(dirty && !saving);

  function update(field: keyof CompanyProfile, value: string) {
    setDirty(true);
    setMessage("");
    setErrors((current) => ({ ...current, [field]: "" }));
    setProfile((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!profile.name.trim()) found.name = "請輸入公司或商號名稱，它會印在所有文件的抬頭。";
    if (profile.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email.trim()))
      found.email = "電郵格式看起來不正確，例如：hello@company.com。";
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    setMessage("");
    try {
      // The endpoint validates strictly. Sending the whole organization object
      // (with id, role, currency, template…) is what used to make every save
      // fail with “公司資料格式不正確。”
      await request("/api/organization/profile", {
        body: JSON.stringify({
          address: profile.address,
          bankDetails: profile.bankDetails,
          businessRegistration: profile.businessRegistration,
          contact: profile.contact,
          email: profile.email,
          name: profile.name,
          phone: profile.phone,
        }),
        method: "PUT",
      });
      setDirty(false);
      notify.success("公司資料已儲存", "之後新開立的收據、報價單與請款單都會使用這份資料。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法儲存公司資料，請稍後再試一次。");
    } finally {
      setSaving(false);
    }
  }

  if (!canManageSettings) {
    return (
      <div className="page">
        <PageHeader
          crumbs={[{ label: "設定" }, { label: "公司資料" }]}
          description="公司抬頭、聯絡方式與收款銀行資料。"
          title="公司資料"
        />
        <Callout title="你沒有修改公司資料的權限" tone="warning">
          <p>只有工作區的擁有者與管理者可以修改公司資料。如果需要更新抬頭或收款資料，請聯絡他們。</p>
        </Callout>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        crumbs={[{ label: "設定" }, { label: "公司資料" }]}
        description="這份資料會印在報價單與請款單的抬頭，也會帶入新開立的收據。已儲存的歷史文件保留當時的內容，不會被修改影響。"
        how={help.company}
        title="公司資料"
      />

      <form className="form-card" onSubmit={(event) => void submit(event)}>
        <FormSection description="會出現在所有文件最上方。" title="公司身分">
          <FormGrid>
            <Field
              error={errors.name}
              hint="文件抬頭，例如：RE Company Limited。"
              label="公司／商號名稱"
              onChange={(event) => update("name", event.target.value)}
              required
              span
              value={profile.name}
            />
            <Field
              hint="會以「商業登記號碼：…」的形式印出。"
              label="商業登記號碼"
              onChange={(event) => update("businessRegistration", event.target.value)}
              placeholder="12345678"
              value={profile.businessRegistration}
            />
            <Field
              label="公司地址"
              onChange={(event) => update("address", event.target.value)}
              placeholder="香港九龍…"
              value={profile.address}
            />
          </FormGrid>
        </FormSection>

        <FormSection description="客戶要聯絡你的時候會用到。" title="聯絡方式">
          <FormGrid>
            <Field
              label="聯絡電話"
              onChange={(event) => update("phone", event.target.value)}
              placeholder="+852 1234 5678"
              value={profile.phone}
            />
            <Field
              error={errors.email}
              label="電子郵件"
              onChange={(event) => update("email", event.target.value)}
              placeholder="hello@company.com"
              type="email"
              value={profile.email}
            />
            <Field
              hint="收據上的聯絡資料欄會使用這一行；留空時會改用上面的電話。"
              label="收據用聯絡資料"
              onChange={(event) => update("contact", event.target.value)}
              placeholder="+852 1234 5678 · hello@company.com"
              span
              value={profile.contact}
            />
          </FormGrid>
        </FormSection>

        <FormSection description="會印在報價單與請款單的付款資訊區，讓客戶知道錢要匯到哪裡。" title="收款銀行資料">
          <TextareaField
            hint="可以分行填寫銀行、代碼、帳號與戶名。"
            label="收款銀行資料"
            onChange={(event) => update("bankDetails", event.target.value)}
            placeholder={"HSBC 004 · 123-456789-838\n戶名：RE Company Limited"}
            rows={4}
            span
            value={profile.bankDetails}
          />
        </FormSection>

        <FormError>{message}</FormError>
        <FormActions>
          <Button
            icon={<Save aria-hidden="true" size={16} />}
            pending={saving}
            pendingLabel="儲存中…"
            type="submit"
            variant="primary"
          >
            儲存公司資料
          </Button>
        </FormActions>
        <FormNote>幣別與時區在建立工作區時設定，目前無法在這裡修改。</FormNote>
      </form>
    </div>
  );
}
