"use client";

/* The uploaded seal is served by an authenticated API route and cannot pass
   through Next's image optimizer. */
/* eslint-disable @next/next/no-img-element */

import { FileUp, RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/app/button";
import { Callout } from "@/components/app/feedback";
import { CheckboxField, Field, FormActions, FormError, FormGrid, FormSection, SelectField } from "@/components/app/form";
import { PageHeader } from "@/components/app/page-header";
import { useWorkspace } from "@/components/app/session";
import { notify } from "@/components/app/toast";
import { ReceiptPaper } from "@/components/features/receipts/receipt-paper";
import { request } from "@/lib/api";
import { help } from "@/lib/help-content";
import { organizationLogoUrl, organizationSealUrl } from "@/lib/organization-assets";
import { newReceiptDraft } from "@/lib/receipt-form";
import { defaultReceiptTemplate, receiptTemplatePresets, type ReceiptTemplate } from "@/lib/receipt-template";

const presetLabels: Record<ReceiptTemplate["preset"], { description: string; label: string }> = {
  classic: { description: "深綠標題列，適合大部分商號", label: "經典" },
  formal: { description: "深藍寬標題列，偏正式商務", label: "正式商務" },
  minimal: { description: "細線黑白，最低調", label: "簡約" },
};

const displayOptions: Array<{
  description: string;
  key: keyof Pick<
    ReceiptTemplate,
    "showBusinessRegistration" | "showContact" | "showPaymentMethod" | "showNotes" | "showSignature" | "showDisclaimer"
  >;
  label: string;
}> = [
  { description: "在抬頭下方印出 BR 號碼", key: "showBusinessRegistration", label: "商業登記號碼" },
  { description: "印出公司電話與電郵", key: "showContact", label: "聯絡資料" },
  { description: "印出這筆款項的付款方式", key: "showPaymentMethod", label: "付款方式" },
  { description: "印出收據的備註文字", key: "showNotes", label: "備註" },
  { description: "留出手寫簽名的位置", key: "showSignature", label: "簽署欄" },
  { description: "印出「本收據非稅務發票」的說明", key: "showDisclaimer", label: "免責聲明" },
];

export function ReceiptTemplateForm() {
  const { canManageSettings, currency, organization } = useWorkspace();
  const router = useRouter();

  const [template, setTemplate] = useState<ReceiptTemplate>(organization.receiptTemplate ?? defaultReceiptTemplate);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [sealVersion, setSealVersion] = useState(organization.sealUpdatedAt ?? organization.id);
  const [hasSeal, setHasSeal] = useState(organization.hasSealImage);

  const logoUrl = organizationLogoUrl(organization);
  const sealUrl = organizationSealUrl({ ...organization, hasSealImage: hasSeal, sealUpdatedAt: sealVersion });

  const previewReceipt = {
    ...newReceiptDraft("2026-08-30", {
      address: organization.address,
      businessRegistration: organization.businessRegistration,
      contact: organization.contact,
      name: organization.name,
    }),
    amount: "1280",
    description: "顧問服務費",
    payerName: "Chan Tai Man",
    receiptNumber: "RC-20260830-001",
  };

  function update<Key extends keyof ReceiptTemplate>(key: Key, value: ReceiptTemplate[Key]) {
    setMessage("");
    setTemplate((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      await request("/api/organization/receipt-template", {
        body: JSON.stringify(template),
        method: "PUT",
      });
      notify.success("收據樣式已儲存", "之後新開立與批量列印的收據都會使用這個樣式。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法儲存收據樣式，請稍後再試一次。");
    } finally {
      setSaving(false);
    }
  }

  async function uploadSeal(file?: File) {
    if (!file) return;
    setUploading(true);
    setMessage("");
    try {
      const body = new FormData();
      body.set("file", file);
      const data = await request<{ sealUpdatedAt: string }>("/api/organization/seal", { body, method: "POST" });
      setHasSeal(true);
      setSealVersion(data.sealUpdatedAt);
      update("sealSource", "uploaded");
      notify.info("印章已上傳", "還要按下「儲存收據樣式」才會套用到收據上。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法上傳公司印章。");
    } finally {
      setUploading(false);
    }
  }

  if (!canManageSettings) {
    return (
      <div className="page">
        <PageHeader
          crumbs={[{ label: "設定" }, { label: "收據樣式" }]}
          description="收據的版型、主色、印章與顯示欄位。"
          title="收據樣式"
        />
        <Callout title="你沒有修改收據樣式的權限" tone="warning">
          <p>只有工作區的擁有者與管理者可以調整收據樣式。</p>
        </Callout>
      </div>
    );
  }

  return (
    <div className="page page-wide">
      <PageHeader
        crumbs={[{ label: "設定" }, { label: "收據樣式" }]}
        description="設定整間公司的收據外觀。右側會即時預覽，儲存後套用到之後所有新開立與批量列印的收據。"
        how={help.receiptTemplate}
        primaryAction={
          <Button
            icon={<Save aria-hidden="true" size={16} />}
            onClick={() => void save()}
            pending={saving}
            pendingLabel="儲存中…"
            variant="primary"
          >
            儲存收據樣式
          </Button>
        }
        secondaryActions={
          <Button
            icon={<RotateCcw aria-hidden="true" size={15} />}
            onClick={() => setTemplate(defaultReceiptTemplate)}
            variant="secondary"
          >
            回復預設
          </Button>
        }
        title="收據樣式"
      />

      <div className="appearance">
        <div className="form-card">
          <FormSection description="先選一個接近的版型，再微調細節。" title="版型">
            <div className="template-picker">
              {(["classic", "minimal", "formal"] as const).map((preset) => (
                <button
                  aria-pressed={template.preset === preset}
                  className={template.preset === preset ? "template-choice is-active" : "template-choice"}
                  key={preset}
                  onClick={() =>
                    setTemplate((current) => ({ ...current, ...receiptTemplatePresets[preset], preset }))
                  }
                  type="button"
                >
                  <span className={`template-swatch ${preset}`} />
                  {presetLabels[preset].label}
                </button>
              ))}
            </div>
            <p className="field-hint">{presetLabels[template.preset].description}</p>
          </FormSection>

          <FormSection title="標題與顏色">
            <FormGrid>
              <Field
                hint="印在收據右上角的大標題。"
                label="收據標題"
                onChange={(event) => update("receiptTitle", event.target.value)}
                placeholder="RECEIPT"
                value={template.receiptTitle}
              />
              <div className="field">
                <span className="field-label">
                  <span>主色</span>
                </span>
                <div className="color-row">
                  <input
                    aria-label="收據主色"
                    className="control"
                    onChange={(event) => update("accentColor", event.target.value)}
                    type="color"
                    value={template.accentColor}
                  />
                  <code>{template.accentColor}</code>
                </div>
                <p className="field-hint">用於頂線、標題與金額。</p>
              </div>
              <SelectField
                label="Logo 位置"
                onChange={(event) => update("logoPosition", event.target.value as ReceiptTemplate["logoPosition"])}
                span
                value={template.logoPosition}
              >
                <option value="left">靠左</option>
                <option value="center">置中</option>
                <option value="right">靠右</option>
              </SelectField>
            </FormGrid>
            {logoUrl ? null : (
              <p className="field-hint">目前還沒有上傳公司 Logo，收據上不會顯示圖片。</p>
            )}
          </FormSection>

          <FormSection description="勾選要印在收據上的欄位。取消勾選只影響列印，資料仍會儲存。" title="顯示內容">
            <div className="toggle-grid">
              {displayOptions.map((option) => (
                <CheckboxField
                  checked={template[option.key]}
                  description={option.description}
                  key={option.key}
                  label={option.label}
                  onChange={(event) => update(option.key, event.target.checked)}
                />
              ))}
            </div>
          </FormSection>

          <FormSection description="可以用系統生成的圓印，或上傳公司現有的印章圖片。" title="公司印章">
            <CheckboxField
              checked={template.showSeal}
              description="關閉時收據上不會出現任何印章。"
              label="在收據上顯示印章"
              onChange={(event) => update("showSeal", event.target.checked)}
            />

            <div className="seal-picker" role="radiogroup">
              <label className={template.sealSource === "generated" ? "seal-option is-active" : "seal-option"}>
                <input
                  checked={template.sealSource === "generated"}
                  disabled={!template.showSeal}
                  name="seal-source"
                  onChange={() => update("sealSource", "generated")}
                  type="radio"
                  value="generated"
                />
                <strong>系統生成</strong>
                <span>依中英文公司名稱畫出圓形印章</span>
              </label>
              <label className={template.sealSource === "uploaded" ? "seal-option is-active" : "seal-option"}>
                <input
                  checked={template.sealSource === "uploaded"}
                  disabled={!template.showSeal}
                  name="seal-source"
                  onChange={() => update("sealSource", "uploaded")}
                  type="radio"
                  value="uploaded"
                />
                <strong>上傳圖片</strong>
                <span>{hasSeal ? "使用已上傳的公司印章" : "上傳 PNG、JPG 或 WebP"}</span>
              </label>
            </div>

            {template.sealSource === "generated" ? (
              <FormGrid>
                <Field
                  disabled={!template.showSeal}
                  label="印章中文名稱"
                  onChange={(event) => update("sealChineseName", event.target.value)}
                  placeholder="逆衡隨性工作室"
                  value={template.sealChineseName}
                />
                <Field
                  disabled={!template.showSeal}
                  hint="會沿著印章外圈排列。"
                  label="印章英文名稱"
                  onChange={(event) => update("sealEnglishName", event.target.value)}
                  placeholder="RE-Casual Studio"
                  value={template.sealEnglishName}
                />
              </FormGrid>
            ) : (
              <div className="seal-upload">
                <div className="seal-upload-row">
                  {hasSeal && sealUrl ? <img alt="已上傳的公司印章" src={sealUrl} /> : null}
                  <p>
                    {hasSeal
                      ? "已上傳公司印章，你可以換成另一個檔案。"
                      : "還沒有上傳印章，請先選擇圖片檔。"}
                  </p>
                </div>
                <label>
                  <FileUp aria-hidden="true" size={16} />
                  <span>{uploading ? "上傳中…" : hasSeal ? "更換印章檔案" : "上傳印章檔案"}</span>
                  <input
                    accept="image/png,image/jpeg,image/webp"
                    disabled={!template.showSeal || uploading}
                    onChange={(event) => {
                      void uploadSeal(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                    type="file"
                  />
                </label>
                <small>支援 PNG、JPG、WebP。建議使用透明背景，檔案小於 2 MB。</small>
              </div>
            )}
          </FormSection>

          <FormError>{message}</FormError>
          <FormActions>
            <Button
              icon={<Save aria-hidden="true" size={16} />}
              onClick={() => void save()}
              pending={saving}
              pendingLabel="儲存中…"
              variant="primary"
            >
              儲存收據樣式
            </Button>
          </FormActions>
        </div>

        <div className="appearance-preview">
          <p>即時預覽（範例資料）</p>
          <ReceiptPaper
            currency={currency}
            logoUrl={logoUrl}
            receipt={previewReceipt}
            sealUrl={sealUrl}
            template={template}
          />
        </div>
      </div>
    </div>
  );
}
