"use client";

import { Download, FileDown, FileText, FileUp, Rows3 } from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import { Button, ButtonLink } from "@/components/app/button";
import { Callout } from "@/components/app/feedback";
import { FeatureDisabled } from "@/components/app/empty-state";
import {
  Disclosure,
  Field,
  FormActions,
  FormError,
  FormGrid,
  FormNote,
  FormSection,
  ReadOnlyField,
  SelectField,
  TextareaField,
} from "@/components/app/form";
import { PageHeader } from "@/components/app/page-header";
import { useWorkspace } from "@/components/app/session";
import { Card } from "@/components/app/surfaces";
import { notify } from "@/components/app/toast";
import { useUnsavedChanges } from "@/components/app/dirty-guard";
import { ReceiptPaper } from "@/components/features/receipts/receipt-paper";
import { ApiError, request } from "@/lib/api";
import { currencyAmount, today } from "@/lib/format";
import { help } from "@/lib/help-content";
import { organizationLogoUrl, organizationSealUrl } from "@/lib/organization-assets";
import {
  batchRowCount,
  batchTemplateCsv,
  hiddenPaymentMethod,
  newReceiptDraft,
  otherPaymentMethod,
  parseBatchReceipts,
  paymentMethodIsValid,
  paymentMethodOptions,
  paymentMethodSelectValue,
  serializeReceipt,
  type BatchReceipt,
} from "@/lib/receipt-form";
import type { ReceiptDraft } from "@/types/records";

const TODAY = today();

type Mode = "single" | "batch";

export function ReceiptCreate() {
  const { canManageRecords, currency, organization } = useWorkspace();
  const issuer = useMemo(
    () => ({
      address: organization.address,
      businessRegistration: organization.businessRegistration,
      contact: organization.contact,
      name: organization.name,
    }),
    [organization],
  );

  const [mode, setMode] = useState<Mode>("single");
  const [draft, setDraft] = useState<ReceiptDraft>(() => newReceiptDraft(TODAY, issuer));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [created, setCreated] = useState<{ count: number; numbers: string[] } | null>(null);
  const [printQueue, setPrintQueue] = useState<ReceiptDraft[]>([]);

  const [batchText, setBatchText] = useState("");
  const [batchError, setBatchError] = useState("");

  const logoUrl = organizationLogoUrl(organization);
  const sealUrl = organizationSealUrl(organization);
  const touched =
    Boolean(draft.payerName || draft.description || draft.amount || draft.notes || batchText) && !created;
  useUnsavedChanges(touched);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void request<{ descriptionSuggestions?: string[] }>("/api/receipts")
        .then((data) => setSuggestions(data.descriptionSuggestions ?? []))
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.isForbidden) setBlocked(error.message);
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function update(field: keyof ReceiptDraft, value: string) {
    setCreated(null);
    setFormError("");
    setErrors((current) => ({ ...current, [field]: "" }));
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function validate(target: ReceiptDraft) {
    const found: Record<string, string> = {};
    if (!target.issuerName.trim()) found.issuerName = "請輸入商號或收款人名稱，它會印在收據抬頭。";
    if (!target.payerName.trim()) found.payerName = "請輸入付款人名稱，例如：陳大文。";
    if (!target.description.trim()) found.description = "請輸入收款項目，例如：活動報名費。";
    if (!target.amount.trim()) found.amount = "請輸入收款金額。";
    else if (!Number.isFinite(Number(target.amount)) || Number(target.amount) < 0)
      found.amount = "金額必須是 0 或以上的數字。";
    if (!target.issueDate) found.issueDate = "請選擇開立日期。";
    if (!paymentMethodIsValid(target.paymentMethod)) found.paymentMethod = "請填寫付款方式。";
    return found;
  }

  async function save(receipts: ReceiptDraft[]) {
    setSaving(true);
    setFormError("");
    try {
      const data = await request<{ count: number; receiptNumbers?: string[] }>("/api/receipts", {
        body: JSON.stringify({ receipts: receipts.map(serializeReceipt) }),
        method: "POST",
      });
      const numbers = (data.receiptNumbers ?? []).filter((value): value is string => typeof value === "string");
      return { count: data.count, numbers };
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "無法儲存收據，請稍後再試一次。");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function submitSingle(event: FormEvent) {
    event.preventDefault();
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length) {
      setFormError("有欄位還沒填好。請看下方標紅色的欄位說明。");
      const firstInvalid = document.querySelector<HTMLElement>('.control[aria-invalid="true"]');
      firstInvalid?.focus();
      return;
    }

    const result = await save([draft]);
    if (!result || !result.numbers.length) return;

    const numbered = { ...draft, receiptNumber: result.numbers[0] };
    setDraft(numbered);
    setCreated({ count: result.count, numbers: result.numbers });
    setPrintQueue([numbered]);
    notify.success(`收據 ${result.numbers[0]} 已建立`, "接下來會開啟列印視窗，選擇「另存為 PDF」即可下載。");
    window.setTimeout(() => window.print(), 150);
  }

  async function submitBatch() {
    if (!draft.issuerName.trim()) {
      setBatchError("請先填妥收款方名稱，這項資料會套用到每一張收據。");
      return;
    }
    const parsed = parseBatchReceipts(batchText, draft, TODAY);
    setBatchError(parsed.error);
    if (parsed.error) return;

    const result = await save(parsed.receipts);
    if (!result || result.numbers.length !== parsed.receipts.length) return;

    const numbered: BatchReceipt[] = parsed.receipts.map((receipt, index) => ({
      ...receipt,
      receiptNumber: result.numbers[index],
    }));
    setCreated({ count: result.count, numbers: result.numbers });
    setPrintQueue(numbered);
    notify.success(`已建立 ${result.count} 張收據`, "接下來會開啟列印視窗，每張收據各自一頁。");
    window.setTimeout(() => window.print(), 150);
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setBatchError("檔案不可超過 5 MB。請分批匯入。");
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["csv", "tsv", "txt", "xlsx", "xls"].includes(extension)) {
      setBatchError("請選擇 CSV、TSV、TXT、XLSX 或 XLS 檔案。");
      return;
    }
    try {
      const text =
        extension === "xlsx" || extension === "xls"
          ? await (async () => {
              const XLSX = await import("xlsx");
              const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
              const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
              if (!firstSheet) throw new Error("EMPTY_SHEET");
              return XLSX.utils.sheet_to_csv(firstSheet, { blankrows: false });
            })()
          : await file.text();
      if (!text.trim()) throw new Error("EMPTY_FILE");
      setBatchText(text.replace(/^﻿/, "").trim());
      setBatchError("");
      notify.info(`已匯入「${file.name}」`, "請確認下方的筆數與內容，再按下建立收據。");
    } catch {
      setBatchError("無法讀取這個檔案。請確認第一個工作表含有正確的收據欄位。");
    }
  }

  function downloadTemplate() {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob(["﻿" + batchTemplateCsv(TODAY)], { type: "text/csv;charset=utf-8" }),
    );
    link.download = "receipt-batch-template.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function startAnother() {
    setDraft(newReceiptDraft(TODAY, issuer));
    setBatchText("");
    setBatchError("");
    setErrors({});
    setFormError("");
    setCreated(null);
    setPrintQueue([]);
  }

  if (blocked) {
    return (
      <div className="page">
        <PageHeader
          crumbs={[
            { href: "/receipts", label: "收據" },
            { label: "開立收據" },
          ]}
          description="開立單張或批量收據。"
          title="開立收據"
        />
        <div className="card">
          <FeatureDisabled feature="收據" message={blocked} />
        </div>
      </div>
    );
  }

  if (!canManageRecords) {
    return (
      <div className="page">
        <PageHeader
          crumbs={[
            { href: "/receipts", label: "收據" },
            { label: "開立收據" },
          ]}
          description="開立單張或批量收據。"
          title="開立收據"
        />
        <Card title="你沒有開立收據的權限">
          <p className="field-hint" style={{ fontSize: 13 }}>
            你目前的角色是「檢視者」，可以查看收據並輸出 PDF，但不能開立新收據。需要開立請聯絡工作區的管理者調整權限。
          </p>
          <FormActions>
            <ButtonLink href="/receipts" variant="secondary">
              回到收據列表
            </ButtonLink>
          </FormActions>
        </Card>
      </div>
    );
  }

  const paymentSelectValue = paymentMethodSelectValue(draft.paymentMethod);
  const rowCount = batchRowCount(batchText);

  return (
    <div className="page page-wide">
      <PageHeader
        crumbs={[
          { href: "/receipts", label: "收據" },
          { label: "開立收據" },
        ]}
        description="填寫資料後，系統會先把收據存進「收據」列表，再開啟列印視窗讓你輸出 PDF。收據編號由系統自動派發。"
        how={mode === "single" ? help.receiptCreate : help.batchReceipts}
        title="開立收據"
      />

      <div className="tabs no-print" role="tablist">
        <button
          aria-selected={mode === "single"}
          className="tab"
          onClick={() => setMode("single")}
          role="tab"
          type="button"
        >
          <FileText aria-hidden="true" size={15} />
          單張收據
        </button>
        <button
          aria-selected={mode === "batch"}
          className="tab"
          onClick={() => setMode("batch")}
          role="tab"
          type="button"
        >
          <Rows3 aria-hidden="true" size={15} />
          批量開立
        </button>
      </div>

      {created ? (
        <div className="no-print">
          <Callout title={created.count === 1 ? `收據 ${created.numbers[0]} 已建立` : `已建立 ${created.count} 張收據`} tone="success">
            <p>
              資料已安全存入「收據」列表。如果列印視窗沒有出現，或你想重新輸出，可以再按一次「重新開啟列印視窗」。
            </p>
            <FormActions>
              <Button onClick={startAnother} variant="secondary">
                再開一張
              </Button>
              <Button
                icon={<FileDown aria-hidden="true" size={15} />}
                onClick={() => window.print()}
                variant="secondary"
              >
                重新開啟列印視窗
              </Button>
              <ButtonLink href="/receipts" variant="primary">
                前往收據列表
              </ButtonLink>
            </FormActions>
          </Callout>
        </div>
      ) : null}

      <div className="builder no-print">
        <div>
          {mode === "single" ? (
            <form className="form-card" onSubmit={(event) => void submitSingle(event)}>
              <FormSection description="這張收據要開給誰、收多少錢。" title="收款內容">
                <FormGrid>
                  <Field
                    error={errors.payerName}
                    label="付款人名稱"
                    onChange={(event) => update("payerName", event.target.value)}
                    placeholder="陳大文"
                    required
                    value={draft.payerName}
                  />
                  <Field
                    error={errors.issueDate}
                    hint="收據編號會依這個日期派發。"
                    label="開立日期"
                    onChange={(event) => update("issueDate", event.target.value)}
                    required
                    type="date"
                    value={draft.issueDate}
                  />
                  <Field
                    error={errors.description}
                    hint={suggestions.length ? "開始輸入可以選擇你之前用過的項目。" : undefined}
                    label="收款項目／說明"
                    list={suggestions.length ? "receipt-descriptions" : undefined}
                    onChange={(event) => update("description", event.target.value)}
                    placeholder="活動報名費"
                    required
                    span
                    value={draft.description}
                  />
                  {suggestions.length ? (
                    <datalist id="receipt-descriptions">
                      {suggestions.map((suggestion) => (
                        <option key={suggestion} value={suggestion} />
                      ))}
                    </datalist>
                  ) : null}
                  <Field
                    error={errors.amount}
                    inputMode="decimal"
                    label={`收款金額（${currency}）`}
                    min="0"
                    onChange={(event) => update("amount", event.target.value)}
                    placeholder="0.00"
                    required
                    step="0.01"
                    type="number"
                    value={draft.amount}
                  />
                  <ReadOnlyField
                    hint="收據上會印出的金額格式。"
                    label="金額預覽"
                    value={currencyAmount(currency, draft.amount)}
                  />
                  <SelectField
                    error={errors.paymentMethod}
                    hint="選「不顯示於收據」只會隱藏列印內容，資料仍會儲存。"
                    label="付款方式"
                    onChange={(event) =>
                      update("paymentMethod", event.target.value === otherPaymentMethod ? "" : event.target.value)
                    }
                    value={paymentSelectValue}
                  >
                    {paymentMethodOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                    <option value={otherPaymentMethod}>其他（自行填寫）</option>
                    <option value={hiddenPaymentMethod}>不顯示於收據</option>
                  </SelectField>
                  {paymentSelectValue === otherPaymentMethod ? (
                    <Field
                      error={errors.paymentMethod}
                      label="其他付款方式"
                      onChange={(event) => update("paymentMethod", event.target.value)}
                      placeholder="轉數快、支票或自訂方式"
                      required
                      value={draft.paymentMethod}
                    />
                  ) : null}
                </FormGrid>

                <Disclosure label="加上付款人地址與備註" summary="兩項都是選填">
                  <FormGrid columns={1}>
                    <Field
                      label="付款人地址"
                      onChange={(event) => update("payerAddress", event.target.value)}
                      placeholder="香港九龍…"
                      value={draft.payerAddress}
                    />
                    <TextareaField
                      hint="會印在收據的付款資訊區，例如感謝語或發票號碼。"
                      label="備註"
                      onChange={(event) => update("notes", event.target.value)}
                      placeholder="Thank you for your payment."
                      rows={2}
                      value={draft.notes}
                    />
                  </FormGrid>
                </Disclosure>
              </FormSection>

              <FormSection
                description={`已由「${organization.name}」的公司資料帶入。只想改這一張收據時可在這裡調整，公司資料不會被改動。`}
                title="收款方資料"
              >
                <Disclosure
                  defaultOpen={Boolean(errors.issuerName)}
                  label="調整這張收據的收款方資料"
                  summary={draft.issuerName || "尚未填寫公司名稱"}
                >
                  <FormGrid>
                    <Field
                      error={errors.issuerName}
                      label="商號／收款人名稱"
                      onChange={(event) => update("issuerName", event.target.value)}
                      placeholder="ABC Company Limited"
                      required
                      value={draft.issuerName}
                    />
                    <Field
                      label="商業登記號碼"
                      onChange={(event) => update("businessRegistration", event.target.value)}
                      placeholder="12345678"
                      value={draft.businessRegistration}
                    />
                    <Field
                      label="地址"
                      onChange={(event) => update("issuerAddress", event.target.value)}
                      placeholder="香港九龍…"
                      span
                      value={draft.issuerAddress}
                    />
                    <Field
                      label="電話／電郵"
                      onChange={(event) => update("issuerContact", event.target.value)}
                      placeholder="+852 1234 5678 · hello@example.com"
                      span
                      value={draft.issuerContact}
                    />
                  </FormGrid>
                </Disclosure>
                <ReadOnlyField
                  hint="格式為 RC-開立日期-流水號，儲存時自動派發。"
                  label="收據編號"
                  value={draft.receiptNumber || "儲存時自動派號"}
                />
              </FormSection>

              <FormError>{formError}</FormError>
              <FormActions>
                <Button onClick={startAnother} variant="ghost">
                  {created ? "再開一張" : "清除重填"}
                </Button>
                {/* Locked after a successful save so the same receipt cannot be
                    issued twice with two different numbers. */}
                <Button
                  disabled={Boolean(created)}
                  icon={<FileDown aria-hidden="true" size={16} />}
                  pending={saving}
                  pendingLabel="儲存中…"
                  type="submit"
                  variant="primary"
                >
                  {created ? "已建立" : "儲存並輸出 PDF"}
                </Button>
              </FormActions>
              <FormNote>
                {created
                  ? "這張收據已經建立好了。要再開一張請按「再開一張」，或修改上方任何欄位重新啟用。"
                  : "如果 PDF 上出現日期、網址或頁碼，請在列印視窗的「更多設定」關閉「頁首與頁尾」。"}
              </FormNote>
            </form>
          ) : (
            <div className="form-card">
              <FormSection
                description={`已由「${organization.name}」帶入，會套用到這批的每一張收據，只需要設定一次。`}
                title="共用的收款方資料"
              >
                <FormGrid>
                  <Field
                    label="商號／收款人名稱"
                    onChange={(event) => update("issuerName", event.target.value)}
                    placeholder="ABC Company Limited"
                    required
                    value={draft.issuerName}
                  />
                  <Field
                    label="商業登記號碼"
                    onChange={(event) => update("businessRegistration", event.target.value)}
                    value={draft.businessRegistration}
                  />
                  <Field
                    label="地址"
                    onChange={(event) => update("issuerAddress", event.target.value)}
                    span
                    value={draft.issuerAddress}
                  />
                  <Field
                    label="電話／電郵"
                    onChange={(event) => update("issuerContact", event.target.value)}
                    span
                    value={draft.issuerContact}
                  />
                </FormGrid>
              </FormSection>

              <FormSection
                description="每行一張收據。可以直接從 Excel 或 Google Sheets 複製貼上，含標題列也沒問題。"
                title="收據資料"
              >
                <label className="dropzone">
                  <FileUp aria-hidden="true" size={20} />
                  <span>
                    <strong>上傳批量檔案</strong>
                    <small>CSV、TSV、TXT、XLSX 或 XLS，讀取第一個工作表，檔案小於 5 MB</small>
                  </span>
                  <input
                    accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv,text/tab-separated-values,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => void importFile(event)}
                    type="file"
                  />
                </label>

                <TextareaField
                  className="control-mono"
                  hint="欄位順序：開立日期、付款人名稱、付款人地址、收款項目、收款金額、付款方式、備註。日期可留空（使用今天）。"
                  label="批量資料"
                  onChange={(event) => {
                    setBatchText(event.target.value);
                    setBatchError("");
                    setCreated(null);
                  }}
                  placeholder={`開立日期,付款人名稱,付款人地址,收款項目／說明,收款金額,付款方式,備註\n${TODAY},陳大文,香港九龍尖沙咀,活動報名費,1500,Bank transfer,Thank you\n${TODAY},王小姐,香港島中環,場地租借,6000,不顯示,`}
                  span
                  value={batchText}
                />

                <Disclosure label="欄位格式與可填寫的值" summary="付款方式、日期、上限">
                  <ul className="hint-list">
                    <li>付款方式可填 Bank transfer、Cash、Cheque、Credit card、FPS、PayMe 或任何自訂文字。</li>
                    <li>付款方式填「不顯示」時，該張收據不會印出付款方式。</li>
                    <li>開立日期留空會使用今天；收據編號依公司與開立日期自動派發。</li>
                    <li>單次最多 100 張收據。</li>
                  </ul>
                  <FormActions>
                    <Button
                      icon={<Download aria-hidden="true" size={15} />}
                      onClick={downloadTemplate}
                      size="sm"
                      variant="secondary"
                    >
                      下載格式範例 CSV
                    </Button>
                  </FormActions>
                </Disclosure>
              </FormSection>

              <FormError>{batchError || formError}</FormError>
              <FormActions>
                <Button onClick={startAnother} variant="ghost">
                  {created ? "再開一批" : "清除重填"}
                </Button>
                <Button
                  disabled={!rowCount || Boolean(created)}
                  icon={<Rows3 aria-hidden="true" size={16} />}
                  onClick={() => void submitBatch()}
                  pending={saving}
                  pendingLabel="儲存中…"
                  variant="primary"
                >
                  {created
                    ? "已建立"
                    : rowCount
                      ? `建立 ${rowCount} 張收據並輸出 PDF`
                      : "建立收據並輸出 PDF"}
                </Button>
              </FormActions>
              <FormNote>
                {created
                  ? "這一批收據已經建立好了。要再處理下一批請按「再開一批」。"
                  : "匯入只會把內容帶進上面的欄位；按下按鈕才會真的建立收據，請先確認筆數與金額。"}
              </FormNote>
            </div>
          )}
        </div>

        <div className="builder-preview">
          <p className="builder-preview-label">
            <span>{mode === "single" ? "收據預覽" : "批量摘要"}</span>
            <span>{mode === "single" ? (created ? "已儲存" : "尚未儲存") : `${rowCount} 筆待建立`}</span>
          </p>
          {mode === "single" ? (
            <ReceiptPaper
              currency={currency}
              logoUrl={logoUrl}
              receipt={draft}
              sealUrl={sealUrl}
              template={organization.receiptTemplate}
            />
          ) : (
            <div className="builder-scale">
              <p className="field-hint" style={{ fontSize: 13 }}>
                系統會把上方的共用收款方資料套到每一張收據，為每張自動派號，並在列印時各自分頁。
              </p>
              <p className="lines-total" style={{ marginTop: 12 }}>
                <strong>{rowCount || 0}</strong> 筆待建立
              </p>
            </div>
          )}
          <p className="legal-note">
            此工具提供一般普通收據版面，不包含香港電子發票、報稅或商業登記申報服務。
          </p>
        </div>
      </div>

      <div className="print-only">
        {printQueue.map((receipt, index) => (
          <ReceiptPaper
            currency={currency}
            key={`${receipt.receiptNumber}-${index}`}
            logoUrl={logoUrl}
            receipt={receipt}
            sealUrl={sealUrl}
            template={organization.receiptTemplate}
          />
        ))}
      </div>
    </div>
  );
}
