"use client";

import { Ban, Banknote, FileDown, Pencil, ReceiptText, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button, ButtonLink } from "@/components/app/button";
import { useConfirm } from "@/components/app/confirm";
import { FeatureDisabled } from "@/components/app/empty-state";
import { LoadError, SkeletonRows } from "@/components/app/feedback";
import { PageHeader } from "@/components/app/page-header";
import { MenuItem, RowActions } from "@/components/app/row-actions";
import { useWorkspace } from "@/components/app/session";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, NextStep, RelatedDocuments, SummaryList } from "@/components/app/surfaces";
import { notify } from "@/components/app/toast";
import { InvoicePaper } from "@/components/features/invoices/invoice-paper";
import { RecordPaymentDialog } from "@/components/features/invoices/record-payment-dialog";
import { ApiError, request } from "@/lib/api";
import { currencyAmount, daysUntil, formatDate, formatDateTime, today } from "@/lib/format";
import { help } from "@/lib/help-content";
import type { Invoice, InvoiceLinks } from "@/types/records";

const TODAY = today();

export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const { canManageRecords, currency } = useWorkspace();
  const confirm = useConfirm();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [links, setLinks] = useState<InvoiceLinks>({ receipt: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [recording, setRecording] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    void request<{ invoice: Invoice } & InvoiceLinks>(`/api/invoices/${invoiceId}`)
      .then((data) => {
        setInvoice(data.invoice);
        setLinks({ receipt: data.receipt });
      })
      .catch((failure: unknown) => {
        if (failure instanceof ApiError && failure.isForbidden) setBlocked(failure.message);
        else setError(failure instanceof Error ? failure.message : "無法讀取這張請款單。");
      })
      .finally(() => setLoading(false));
  }, [invoiceId]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function act(action: "send" | "void") {
    if (!invoice) return;
    const dialog =
      action === "send"
        ? {
            confirmLabel: "標示為已發送",
            consequence: "標示後這張請款單就不能再編輯內容，並開始依付款到期日追蹤是否逾期。",
            danger: false,
            title: `已經把 ${invoice.invoiceNumber} 送給客戶了？`,
          }
        : {
            confirmLabel: "作廢請款單",
            consequence: "作廢後這張請款單會保留在紀錄中，但表示不應再向客戶請款，而且無法還原。",
            danger: true,
            title: `要作廢 ${invoice.invoiceNumber} 嗎？`,
          };

    const proceed = await confirm(dialog);
    if (!proceed) return;

    setWorking(true);
    try {
      const data = await request<{ invoice: Invoice }>(`/api/invoices/${invoice.id}`, {
        body: JSON.stringify({ action }),
        method: "PATCH",
      });
      setInvoice(data.invoice);
      notify.success(
        action === "send" ? `${invoice.invoiceNumber} 已標示為已發送` : `${invoice.invoiceNumber} 已作廢`,
        action === "send" ? "接下來會依付款到期日顯示未付款或已逾期。" : undefined,
      );
    } catch (failure) {
      notify.error("無法更新請款單", failure instanceof Error ? failure.message : undefined);
    } finally {
      setWorking(false);
    }
  }

  /** Issues the receipt for a settled invoice — the point income is recognised. */
  async function createReceipt() {
    if (!invoice) return;
    const proceed = await confirm({
      confirmLabel: "開立收據",
      consequence: `會依這張請款單開立一張已收款的收據，金額 ${currencyAmount(currency, invoice.totalAmount)}，並列入「收支紀錄」。每張請款單只能開立一次。`,
      title: `要為 ${invoice.invoiceNumber} 開立收據嗎？`,
    });
    if (!proceed) return;

    setWorking(true);
    try {
      const data = await request<{ receipt: { id: string; receiptNumber: string } }>(
        `/api/invoices/${invoice.id}/receipt`,
        { method: "POST" },
      );
      notify.success(`已開立收據 ${data.receipt.receiptNumber}`, "這筆款項已列入收支紀錄。");
      load();
    } catch (failure) {
      notify.error("無法開立收據", failure instanceof Error ? failure.message : undefined);
    } finally {
      setWorking(false);
    }
  }

  const crumbs = [
    { href: "/invoices", label: "請款單" },
    { label: invoice?.invoiceNumber ?? "載入中…" },
  ];

  if (blocked) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="請款單內容與後續操作。" title="請款單" />
        <div className="card">
          <FeatureDisabled feature="請款單" message={blocked} />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="請款單內容與後續操作。" title="請款單" />
        <div className="card">
          <SkeletonRows label="正在載入請款單" rows={8} />
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="請款單內容與後續操作。" title="請款單" />
        <LoadError message={error || "找不到這張請款單。"} onRetry={load} />
      </div>
    );
  }

  const remaining = daysUntil(invoice.dueDate, TODAY);
  const canRecordPayment =
    canManageRecords && invoice.status === "sent" && invoice.paymentStatus !== "paid";

  /* One primary action, decided by where the invoice is in its life: send it,
     then collect against it. */
  const primaryAction =
    canManageRecords && invoice.status === "draft" ? (
      <Button
        icon={<Send aria-hidden="true" size={16} />}
        onClick={() => void act("send")}
        pending={working}
        variant="primary"
      >
        標示為已發送
      </Button>
    ) : canRecordPayment ? (
      <Button
        icon={<Banknote aria-hidden="true" size={16} />}
        onClick={() => setRecording(true)}
        variant="primary"
      >
        登記收款
      </Button>
    ) : links.receipt ? (
      <ButtonLink
        href={`/receipts/${links.receipt.id}`}
        icon={<ReceiptText aria-hidden="true" size={16} />}
        variant="primary"
      >
        查看收據 {links.receipt.receiptNumber}
      </ButtonLink>
    ) : canManageRecords && invoice.effectiveStatus === "paid" ? (
      <Button
        icon={<ReceiptText aria-hidden="true" size={16} />}
        onClick={() => void createReceipt()}
        pending={working}
        variant="primary"
      >
        開立收據
      </Button>
    ) : null;

  return (
    <div className="page page-wide">
      <PageHeader
        crumbs={crumbs}
        description={`向 ${invoice.customerSnapshot.companyName || invoice.customerSnapshot.name} 請款，付款到期日 ${formatDate(invoice.dueDate)}。`}
        how={help.invoices}
        primaryAction={primaryAction}
        secondaryActions={
          <>
            <Button icon={<FileDown aria-hidden="true" size={15} />} onClick={() => window.print()} variant="secondary">
              下載 PDF
            </Button>
            {canManageRecords && invoice.status === "draft" ? (
              <ButtonLink
                href={`/invoices/${invoice.id}/edit`}
                icon={<Pencil aria-hidden="true" size={15} />}
                variant="secondary"
              >
                編輯
              </ButtonLink>
            ) : null}
            {canManageRecords && invoice.status !== "void" && !invoice.payments.length ? (
              <RowActions
                menu={
                  <MenuItem danger icon={<Ban aria-hidden="true" size={15} />} onClick={() => void act("void")}>
                    作廢請款單
                  </MenuItem>
                }
              />
            ) : null}
          </>
        }
        status={<StatusBadge domain="invoice" value={invoice.effectiveStatus} withHint />}
        title={invoice.invoiceNumber}
      />

      <SummaryList
        items={[
          { label: "客戶", value: invoice.customerSnapshot.companyName || invoice.customerSnapshot.name },
          { label: "開立日期", value: formatDate(invoice.issueDate) },
          {
            label: "付款到期日",
            value:
              invoice.effectiveStatus === "overdue"
                ? `${formatDate(invoice.dueDate)}（已逾期 ${Math.abs(remaining)} 天）`
                : invoice.status === "sent" && Number.isFinite(remaining)
                  ? `${formatDate(invoice.dueDate)}（還有 ${remaining} 天）`
                  : formatDate(invoice.dueDate),
          },
          { label: "請款總額", value: currencyAmount(currency, invoice.totalAmount) },
          { label: "已收金額", value: currencyAmount(currency, invoice.paidAmount) },
          {
            label: "尚未收款",
            value:
              invoice.outstandingAmount > 0
                ? currencyAmount(currency, invoice.outstandingAmount)
                : "已全數收妥",
          },
        ]}
      />

      {invoice.sourceQuoteId || links.receipt ? (
        <RelatedDocuments>
          {invoice.sourceQuoteId ? (
            <ButtonLink href={`/quotes/${invoice.sourceQuoteId}`} size="sm" variant="secondary">
              來源報價單 {invoice.sourceQuoteNumber}
            </ButtonLink>
          ) : null}
          {links.receipt ? (
            <ButtonLink href={`/receipts/${links.receipt.id}`} size="sm" variant="secondary">
              收據 {links.receipt.receiptNumber}
            </ButtonLink>
          ) : null}
        </RelatedDocuments>
      ) : null}

      <NextStep>{describeNextStep(invoice, canManageRecords, remaining, Boolean(links.receipt))}</NextStep>

      {invoice.payments.length ? (
        <div className="no-print" style={{ marginBottom: 18 }}>
          <Card description="每一次收到款項的紀錄，最新的在最上面。" title="收款紀錄">
            <ul className="payment-list">
              {invoice.payments.map((payment) => (
                <li className="payment-row" key={payment.id}>
                  <span className="payment-date">{formatDate(payment.paidAt)}</span>
                  <b className="payment-amount">{currencyAmount(currency, payment.amount)}</b>
                  <span className="payment-note">
                    {[payment.paymentMethod, payment.reference, payment.note].filter(Boolean).join(" · ") || "—"}
                    {/* Who booked the money and when, so a colleague's entry is
                        never anonymous. */}
                    <small className="payment-meta">
                      {payment.createdByName ? `${payment.createdByName} 登記於 ` : "登記於 "}
                      {formatDateTime(payment.createdAt)}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      <div className="doc-frame print-keep">
        <p className="doc-frame-label no-print">文件內容（這就是客戶會收到的 PDF）</p>
        <InvoicePaper currency={currency} invoice={invoice} />
      </div>

      <RecordPaymentDialog
        currency={currency}
        invoice={invoice}
        onClose={() => setRecording(false)}
        onRecorded={(updated) => {
          setRecording(false);
          setInvoice(updated);
        }}
        open={recording}
      />
    </div>
  );
}

function describeNextStep(invoice: Invoice, canManage: boolean, remaining: number, receipted: boolean) {
  if (!canManage) return "你的角色可以查看與下載這張請款單，但不能變更狀態。";
  switch (invoice.effectiveStatus) {
    case "draft":
      return "先按「下載 PDF」傳給客戶，再回來標示為已發送。標示之後內容就會鎖定。";
    case "overdue":
      return `付款已逾期 ${Math.abs(remaining)} 天，建議聯絡客戶確認。收到款項後按「登記收款」。`;
    case "unpaid":
      return `已發送，等待客戶在 ${formatDate(invoice.dueDate)} 前付款。收到款項後按「登記收款」，可以分次登記。`;
    case "partially_paid":
      return "已收到部分款項。收到後續款項時再按「登記收款」，全數收妥後狀態會自動變成已付款。";
    case "paid":
      return receipted
        ? "款項已全數收到，收據也已開立並列入收入。"
        : "款項已全數收到。按「開立收據」產生收據，這筆金額就會列入收支紀錄。";
    case "void":
      return "這張請款單已作廢，只保留紀錄。需要重新請款請建立一張新的。";
    default:
      return "";
  }
}
