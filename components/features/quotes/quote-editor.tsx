"use client";

import { Save, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/app/button";
import { useConfirm } from "@/components/app/confirm";
import { useUnsavedChanges } from "@/components/app/dirty-guard";
import { Callout, LoadError, SkeletonRows } from "@/components/app/feedback";
import { FeatureDisabled } from "@/components/app/empty-state";
import {
  Disclosure,
  Field,
  FormActions,
  FormError,
  FormGrid,
  FormNote,
  FormSection,
  SelectField,
  TextareaField,
} from "@/components/app/form";
import { PageHeader } from "@/components/app/page-header";
import { useWorkspace } from "@/components/app/session";
import { SummaryList } from "@/components/app/surfaces";
import { notify } from "@/components/app/toast";
import { blankCustomerFields, customerFields, type CustomerFields } from "@/components/features/customers/customer-fields";
import {
  LineItemsEditor,
  blankEditableLine,
  lineTotals,
  toEditableLines,
  toLinePayload,
  validateLines,
  type EditableLine,
  type LineErrors,
} from "@/components/features/documents/line-items-editor";
import { ApiError, request } from "@/lib/api";
import { addDays, currencyAmount, fallback, joinParts, today } from "@/lib/format";
import { help } from "@/lib/help-content";
import type { Customer, Item, Quote } from "@/types/records";

const TODAY = today();
const DEFAULT_VALIDITY_DAYS = 30;

type CustomerMode = "saved" | "manual";

export function QuoteEditor({ quoteId }: { quoteId?: string }) {
  const { canManageRecords, currency } = useWorkspace();
  const router = useRouter();
  const confirm = useConfirm();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailure, setLoadFailure] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);

  const [existing, setExisting] = useState<Quote | null>(null);
  const [mode, setMode] = useState<CustomerMode>("saved");
  const [customerId, setCustomerId] = useState("");
  const [fields, setFields] = useState<CustomerFields>(blankCustomerFields);
  const [issueDate, setIssueDate] = useState(TODAY);
  const [validUntil, setValidUntil] = useState(addDays(TODAY, DEFAULT_VALIDITY_DAYS));
  const [lines, setLines] = useState<EditableLine[]>([blankEditableLine()]);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [archivedCustomer, setArchivedCustomer] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lineErrors, setLineErrors] = useState<LineErrors[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useUnsavedChanges(dirty && !saving);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      void Promise.all([
        request<{ customers?: Customer[] }>("/api/customers?status=active"),
        loadItems(),
        quoteId ? request<{ quote: Quote }>(`/api/quotes/${quoteId}`) : Promise.resolve(null),
      ])
        .then(([customerData, itemData, quoteData]) => {
          const activeCustomers = customerData.customers ?? [];
          setCustomers(activeCustomers);
          setItems(itemData);
          if (quoteData) {
            const quote = quoteData.quote;
            setExisting(quote);
            setIssueDate(quote.issueDate);
            setValidUntil(quote.validUntil);
            setLines(toEditableLines(quote.lines));
            setNotes(quote.notes);
            setTerms(quote.terms);
            setFields(customerFields(quote.customerSnapshot));
            const stillActive = quote.customerId
              ? activeCustomers.some((candidate) => candidate.id === quote.customerId)
              : false;
            if (quote.customerId && stillActive) {
              setMode("saved");
              setCustomerId(quote.customerId);
            } else {
              setMode("manual");
              setArchivedCustomer(Boolean(quote.customerId));
            }
          }
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.isForbidden) setBlocked(error.message);
          else setLoadFailure(error instanceof Error ? error.message : "無法載入這一頁需要的資料。");
        })
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [quoteId]);

  const totals = useMemo(() => lineTotals(lines), [lines]);
  const selectedCustomer = customers.find((candidate) => candidate.id === customerId);

  function touch() {
    setDirty(true);
    setMessage("");
  }

  function chooseSavedCustomer(id: string) {
    touch();
    setCustomerId(id);
    setErrors((current) => ({ ...current, customer: "" }));
    const customer = customers.find((candidate) => candidate.id === id);
    setFields(customer ? customerFields(customer) : blankCustomerFields());
  }

  function switchToManual() {
    touch();
    setMode("manual");
    setCustomerId("");
  }

  function switchToSaved() {
    touch();
    setMode("saved");
    setArchivedCustomer(false);
  }

  function updateField(field: keyof CustomerFields, value: string) {
    touch();
    setErrors((current) => ({ ...current, customer: "", [field]: "" }));
    setFields((current) => ({ ...current, [field]: value }));
  }

  async function cancel() {
    if (dirty) {
      const leave = await confirm({
        confirmLabel: "放棄變更並離開",
        consequence: "這一頁還沒儲存的內容不會保留。已經儲存過的報價單不受影響。",
        danger: true,
        title: "要放棄未儲存的變更嗎？",
      });
      if (!leave) return;
    }
    setDirty(false);
    router.push(existing ? `/quotes/${existing.id}` : "/quotes");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (mode === "saved" && !customerId) found.customer = "請選擇一位客戶，或改用手動輸入。";
    if (mode === "manual" && !fields.name.trim()) found.name = "請輸入客戶名稱，這是報價單上會顯示的名稱。";
    if (!issueDate) found.issueDate = "請選擇開立日期。";
    if (!validUntil) found.validUntil = "請選擇有效期限。";
    else if (issueDate && validUntil < issueDate) found.validUntil = "有效期限不可以早於開立日期。";

    const perLine = validateLines(lines);
    setLineErrors(perLine);
    setErrors(found);
    if (Object.keys(found).length || perLine.some((line) => Object.keys(line).length)) {
      setMessage("有欄位還沒填好。請看下方標紅色的欄位說明。");
      window.setTimeout(() => {
        document.querySelector<HTMLElement>('.control[aria-invalid="true"]')?.focus();
      }, 0);
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const payload = {
        customer: mode === "saved" && selectedCustomer ? customerFields(selectedCustomer) : fields,
        customerEdited: mode === "manual" ? true : undefined,
        customerId: mode === "saved" && customerId ? customerId : undefined,
        customerSelected: mode === "saved" ? true : undefined,
        issueDate,
        lines: toLinePayload(lines),
        notes,
        terms,
        validUntil,
      };
      const data = await request<{ quote: Quote }>(existing ? `/api/quotes/${existing.id}` : "/api/quotes", {
        body: JSON.stringify(payload),
        method: existing ? "PUT" : "POST",
      });
      setDirty(false);
      notify.success(
        existing ? `${data.quote.quoteNumber} 已儲存` : `報價單 ${data.quote.quoteNumber} 已建立`,
        "目前狀態是草稿。確認內容後可以輸出 PDF 並標示為已發送。",
      );
      router.push(`/quotes/${data.quote.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法儲存報價單，請稍後再試一次。");
      setSaving(false);
    }
  }

  const crumbs = existing
    ? [
        { href: "/quotes", label: "報價單" },
        { href: `/quotes/${existing.id}`, label: existing.quoteNumber },
        { label: "編輯" },
      ]
    : [
        { href: "/quotes", label: "報價單" },
        { label: "建立報價單" },
      ];
  const title = existing ? `編輯 ${existing.quoteNumber}` : "建立報價單";

  if (blocked) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="填寫報價單內容。" title={title} />
        <div className="card">
          <FeatureDisabled feature="報價單" message={blocked} />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="填寫報價單內容。" title={title} />
        <div className="card">
          <SkeletonRows label="正在載入報價單" rows={8} />
        </div>
      </div>
    );
  }

  if (loadFailure) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="填寫報價單內容。" title={title} />
        <LoadError message={loadFailure} onRetry={() => router.refresh()} />
      </div>
    );
  }

  if (!canManageRecords) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="填寫報價單內容。" title={title} />
        <Callout title="你沒有編輯報價單的權限" tone="warning">
          <p>你目前的角色是「檢視者」，可以查看報價單與輸出 PDF，但不能建立或編輯。請聯絡工作區的管理者調整權限。</p>
        </Callout>
      </div>
    );
  }

  if (existing && existing.status !== "draft") {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="只有草稿狀態的報價單可以編輯。" title={title} />
        <Callout title={`${existing.quoteNumber} 已經不是草稿`} tone="warning">
          <p>這張報價單目前的狀態不允許編輯內容，這是為了讓已經送出的價格不會在客戶背後被改動。</p>
          <p>如果需要修改，請回到報價單並使用「複製為新草稿」，在新的草稿上調整。</p>
          <FormActions>
            <Button onClick={() => router.push(`/quotes/${existing.id}`)} variant="primary">
              回到 {existing.quoteNumber}
            </Button>
          </FormActions>
        </Callout>
      </div>
    );
  }

  return (
    <div className="page page-wide">
      <PageHeader
        crumbs={crumbs}
        description="儲存後會成為草稿，你可以繼續修改，直到標示為已發送。公司與客戶資料會在儲存時建立快照。"
        how={help.quoteEditor}
        title={title}
      />

      <form className="form-card" onSubmit={(event) => void submit(event)}>
        <FormSection description="報價單要開給誰。" title="客戶">
          {archivedCustomer ? (
            <Callout title="原本的客戶已封存" tone="warning">
              <p>這張報價單原本連結的客戶已被封存，因此改用文件上保留的客戶快照。儲存後會沿用這份資料。</p>
            </Callout>
          ) : null}

          {mode === "saved" ? (
            <>
              <FormGrid columns={1}>
                <SelectField
                  error={errors.customer}
                  hint={
                    customers.length
                      ? "只列出啟用中的客戶。選好之後下面會顯示會印在報價單上的資料。"
                      : "還沒有建立任何客戶，請改用手動輸入。"
                  }
                  label="選擇客戶"
                  onChange={(event) => chooseSavedCustomer(event.target.value)}
                  required
                  value={customerId}
                >
                  <option value="">請選擇客戶</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.companyName || customer.name}
                      {customer.contact ? ` · ${customer.contact}` : ""}
                    </option>
                  ))}
                </SelectField>
              </FormGrid>
              {selectedCustomer ? (
                <SummaryList
                  items={[
                    { label: "客戶名稱", value: selectedCustomer.name },
                    { label: "公司全名", value: fallback(selectedCustomer.companyName) },
                    { label: "聯絡人", value: fallback(selectedCustomer.contact) },
                    {
                      label: "聯絡方式",
                      value: fallback(joinParts([selectedCustomer.phone, selectedCustomer.email])),
                    },
                    { label: "地址", value: fallback(selectedCustomer.address) },
                  ]}
                />
              ) : null}
              <Button onClick={switchToManual} size="sm" variant="ghost">
                客戶不在名單上？改用手動輸入
              </Button>
            </>
          ) : (
            <>
              <FormGrid>
                <Field
                  error={errors.name}
                  hint="報價單上會顯示的名稱。"
                  label="客戶名稱"
                  onChange={(event) => updateField("name", event.target.value)}
                  placeholder="ABC Trading"
                  required
                  value={fields.name}
                />
                <Field
                  label="公司全名"
                  onChange={(event) => updateField("companyName", event.target.value)}
                  placeholder="ABC Trading Company Limited"
                  value={fields.companyName}
                />
                <Field
                  label="聯絡人"
                  onChange={(event) => updateField("contact", event.target.value)}
                  placeholder="陳先生"
                  value={fields.contact}
                />
                <Field
                  label="電話"
                  onChange={(event) => updateField("phone", event.target.value)}
                  value={fields.phone}
                />
                <Field
                  label="電郵"
                  onChange={(event) => updateField("email", event.target.value)}
                  span
                  type="email"
                  value={fields.email}
                />
              </FormGrid>
              <Disclosure label="地址與商業登記號碼" summary="會印在報價單的客戶資料區">
                <FormGrid columns={1}>
                  <Field
                    label="地址"
                    onChange={(event) => updateField("address", event.target.value)}
                    placeholder="香港九龍…"
                    value={fields.address}
                  />
                  <Field
                    label="商業登記號碼／統一編號"
                    onChange={(event) => updateField("businessRegistration", event.target.value)}
                    value={fields.businessRegistration}
                  />
                </FormGrid>
              </Disclosure>
              <FormNote>
                手動輸入的客戶只會存在這張報價單上。要重複使用，請到「客戶」頁新增，或先在這裡填好再到客戶頁建立。
              </FormNote>
              {customers.length ? (
                <Button icon={<UserPlus aria-hidden="true" size={15} />} onClick={switchToSaved} size="sm" variant="ghost">
                  改為從客戶名單選擇
                </Button>
              ) : null}
            </>
          )}
        </FormSection>

        <FormSection description="報價的有效範圍。過期後就不能再轉為請款單。" title="日期">
          <FormGrid>
            <Field
              error={errors.issueDate}
              label="開立日期"
              onChange={(event) => {
                touch();
                setIssueDate(event.target.value);
                setErrors((current) => ({ ...current, issueDate: "" }));
              }}
              required
              type="date"
              value={issueDate}
            />
            <Field
              error={errors.validUntil}
              hint={`預設為開立日期後 ${DEFAULT_VALIDITY_DAYS} 天。`}
              label="有效期限"
              onChange={(event) => {
                touch();
                setValidUntil(event.target.value);
                setErrors((current) => ({ ...current, validUntil: "" }));
              }}
              required
              type="date"
              value={validUntil}
            />
          </FormGrid>
        </FormSection>

        <FormSection description="要報價的商品或服務。小計會自動計算。" title="品項明細">
          <LineItemsEditor
            currency={currency}
            errors={lineErrors}
            items={items}
            lines={lines}
            onChange={(next) => {
              touch();
              setLines(next);
            }}
          />
        </FormSection>

        <FormSection description="會印在報價單下方，客戶看得到。" title="備註與條款">
          <Disclosure
            defaultOpen={Boolean(notes || terms)}
            label="填寫備註與報價條款"
            summary="兩項都是選填"
          >
            <FormGrid columns={1}>
              <TextareaField
                hint="例如交期、包含或不包含的項目。"
                label="備註"
                onChange={(event) => {
                  touch();
                  setNotes(event.target.value);
                }}
                rows={3}
                value={notes}
              />
              <TextareaField
                hint="例如付款條件、報價有效性說明。"
                label="報價條款"
                onChange={(event) => {
                  touch();
                  setTerms(event.target.value);
                }}
                rows={3}
                value={terms}
              />
            </FormGrid>
          </Disclosure>
        </FormSection>

        <FormError>{message}</FormError>
        <FormActions sticky>
          <span style={{ marginRight: "auto", alignSelf: "center", color: "var(--muted)", fontSize: 12.5 }}>
            總金額 <strong style={{ color: "var(--forest)" }}>{currencyAmount(currency, totals.amount)}</strong>
          </span>
          <Button onClick={() => void cancel()} variant="ghost">
            取消
          </Button>
          <Button
            icon={<Save aria-hidden="true" size={16} />}
            pending={saving}
            pendingLabel="儲存中…"
            type="submit"
            variant="primary"
          >
            {existing ? "儲存變更" : "儲存為草稿"}
          </Button>
        </FormActions>
      </form>
    </div>
  );
}

async function loadItems() {
  const data = await request<{ items?: Item[] }>("/api/items");
  return data.items ?? [];
}
