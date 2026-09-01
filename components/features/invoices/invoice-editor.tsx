"use client";

import { Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/app/button";
import { useConfirm } from "@/components/app/confirm";
import { useUnsavedChanges } from "@/components/app/dirty-guard";
import { Callout, LoadError, SkeletonRows } from "@/components/app/feedback";
import { EmptyState, FeatureDisabled } from "@/components/app/empty-state";
import {
  Disclosure,
  Field,
  FormActions,
  FormError,
  FormGrid,
  FormSection,
  SelectField,
  TextareaField,
} from "@/components/app/form";
import { PageHeader } from "@/components/app/page-header";
import { useWorkspace } from "@/components/app/session";
import { SummaryList } from "@/components/app/surfaces";
import { notify } from "@/components/app/toast";
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
import type { Customer, Invoice, Item } from "@/types/records";

const TODAY = today();
const DEFAULT_TERM_DAYS = 30;

export function InvoiceEditor({ invoiceId }: { invoiceId?: string }) {
  const { canManageRecords, currency } = useWorkspace();
  const router = useRouter();
  const confirm = useConfirm();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [existing, setExisting] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailure, setLoadFailure] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState(TODAY);
  const [dueDate, setDueDate] = useState(addDays(TODAY, DEFAULT_TERM_DAYS));
  const [lines, setLines] = useState<EditableLine[]>([blankEditableLine()]);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");

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
        request<{ items?: Item[] }>("/api/items").catch(() => ({ items: [] as Item[] })),
        invoiceId ? request<{ invoice: Invoice }>(`/api/invoices/${invoiceId}`) : Promise.resolve(null),
      ])
        .then(([customerData, itemData, invoiceData]) => {
          setCustomers(customerData.customers ?? []);
          setItems(itemData.items ?? []);
          if (invoiceData) {
            const invoice = invoiceData.invoice;
            setExisting(invoice);
            setCustomerId(invoice.customerId ?? "");
            setIssueDate(invoice.issueDate);
            setDueDate(invoice.dueDate);
            // `subtotal` is computed server-side and rejected by the strict
            // line schema, so it must not travel back on save.
            setLines(toEditableLines(invoice.lines));
            setNotes(invoice.notes);
            setTerms(invoice.terms);
          }
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.isForbidden) setBlocked(error.message);
          else setLoadFailure(error instanceof Error ? error.message : "無法載入這一頁需要的資料。");
        })
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [invoiceId]);

  const totals = useMemo(() => lineTotals(lines), [lines]);
  const selectedCustomer = customers.find((candidate) => candidate.id === customerId);

  function touch() {
    setDirty(true);
    setMessage("");
  }

  async function cancel() {
    if (dirty) {
      const leave = await confirm({
        confirmLabel: "放棄變更並離開",
        consequence: "這一頁還沒儲存的內容不會保留。已經儲存過的請款單不受影響。",
        danger: true,
        title: "要放棄未儲存的變更嗎？",
      });
      if (!leave) return;
    }
    setDirty(false);
    router.push(existing ? `/invoices/${existing.id}` : "/invoices");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!customerId) found.customerId = "請選擇要向誰請款。";
    if (!issueDate) found.issueDate = "請選擇開立日期。";
    if (!dueDate) found.dueDate = "請選擇付款到期日。";
    else if (issueDate && dueDate < issueDate) found.dueDate = "付款到期日不可以早於開立日期。";

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
      const data = await request<{ invoice: Invoice }>(
        existing ? `/api/invoices/${existing.id}` : "/api/invoices",
        {
          body: JSON.stringify({ customerId, dueDate, issueDate, lines: toLinePayload(lines), notes, terms }),
          method: existing ? "PUT" : "POST",
        },
      );
      setDirty(false);
      notify.success(
        existing ? `${data.invoice.invoiceNumber} 已儲存` : `請款單 ${data.invoice.invoiceNumber} 已建立`,
        "目前狀態是草稿。確認內容後可以輸出 PDF 並標示為已發送。",
      );
      router.push(`/invoices/${data.invoice.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法儲存請款單，請稍後再試一次。");
      setSaving(false);
    }
  }

  const crumbs = existing
    ? [
        { href: "/invoices", label: "請款單" },
        { href: `/invoices/${existing.id}`, label: existing.invoiceNumber },
        { label: "編輯" },
      ]
    : [
        { href: "/invoices", label: "請款單" },
        { label: "建立請款單" },
      ];
  const title = existing ? `編輯 ${existing.invoiceNumber}` : "建立請款單";

  if (blocked) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="填寫請款單內容。" title={title} />
        <div className="card">
          <FeatureDisabled feature="請款單" message={blocked} />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="填寫請款單內容。" title={title} />
        <div className="card">
          <SkeletonRows label="正在載入請款單" rows={8} />
        </div>
      </div>
    );
  }

  if (loadFailure) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="填寫請款單內容。" title={title} />
        <LoadError message={loadFailure} onRetry={() => router.refresh()} />
      </div>
    );
  }

  if (!canManageRecords) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="填寫請款單內容。" title={title} />
        <Callout title="你沒有編輯請款單的權限" tone="warning">
          <p>你目前的角色是「檢視者」，可以查看請款單與輸出 PDF，但不能建立或編輯。請聯絡工作區的管理者調整權限。</p>
        </Callout>
      </div>
    );
  }

  if (existing && existing.status !== "draft") {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="只有草稿狀態的請款單可以編輯。" title={title} />
        <Callout title={`${existing.invoiceNumber} 已經不是草稿`} tone="warning">
          <p>已發送或已作廢的請款單不能再修改內容，這是為了讓客戶收到的金額不會在事後被改動。</p>
          <FormActions>
            <Button onClick={() => router.push(`/invoices/${existing.id}`)} variant="primary">
              回到 {existing.invoiceNumber}
            </Button>
          </FormActions>
        </Callout>
      </div>
    );
  }

  if (!customers.length) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="請款單必須指定一位客戶。" title={title} />
        <div className="card">
          <EmptyState
            actions={
              <Link className="btn btn-primary" href="/customers">
                前往新增客戶
              </Link>
            }
            title="還沒有可以請款的客戶"
          >
            <p>請款單需要一位啟用中的客戶，才能把聯絡與開票資料印在文件上。</p>
            <p>先到「客戶」建立一位客戶，再回來建立請款單。</p>
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <div className="page page-wide">
      <PageHeader
        crumbs={crumbs}
        description="儲存後會成為草稿，可以繼續修改，直到標示為已發送。客戶與公司資料會在儲存時建立快照。"
        how={help.invoices}
        title={title}
      />

      <form className="form-card" onSubmit={(event) => void submit(event)}>
        <FormSection description="要向誰請款。只會列出啟用中的客戶。" title="客戶">
          <FormGrid columns={1}>
            <SelectField
              error={errors.customerId}
              label="選擇客戶"
              onChange={(event) => {
                touch();
                setCustomerId(event.target.value);
                setErrors((current) => ({ ...current, customerId: "" }));
              }}
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
                { label: "聯絡人", value: fallback(selectedCustomer.contact) },
                {
                  label: "聯絡方式",
                  value: fallback(joinParts([selectedCustomer.phone, selectedCustomer.email])),
                },
                { label: "地址", value: fallback(selectedCustomer.address) },
              ]}
            />
          ) : null}
        </FormSection>

        <FormSection description="客戶應該在什麼時候付款。" title="日期">
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
              error={errors.dueDate}
              hint={`預設為開立日期後 ${DEFAULT_TERM_DAYS} 天。超過這天仍未付款會顯示為「已逾期」。`}
              label="付款到期日"
              onChange={(event) => {
                touch();
                setDueDate(event.target.value);
                setErrors((current) => ({ ...current, dueDate: "" }));
              }}
              required
              type="date"
              value={dueDate}
            />
          </FormGrid>
        </FormSection>

        <FormSection description="要請款的商品或服務。小計會自動計算。" title="品項明細">
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

        <FormSection description="會印在請款單下方，客戶看得到。" title="備註與付款條款">
          <Disclosure defaultOpen={Boolean(notes || terms)} label="填寫備註與付款條款" summary="兩項都是選填">
            <FormGrid columns={1}>
              <TextareaField
                hint="例如這次請款涵蓋的期間。"
                label="備註"
                onChange={(event) => {
                  touch();
                  setNotes(event.target.value);
                }}
                rows={3}
                value={notes}
              />
              <TextareaField
                hint="例如逾期利息、匯款手續費由誰負擔。收款銀行資料請在「設定 → 公司資料」填寫。"
                label="付款條款"
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
            應付總額 <strong style={{ color: "var(--forest)" }}>{currencyAmount(currency, totals.amount)}</strong>
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
