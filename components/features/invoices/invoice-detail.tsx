"use client";

import { Ban, FileDown, Pencil, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button, ButtonLink } from "@/components/app/button";
import { useConfirm } from "@/components/app/confirm";
import { FeatureDisabled } from "@/components/app/empty-state";
import { LoadError, SkeletonRows } from "@/components/app/feedback";
import { PageHeader } from "@/components/app/page-header";
import { MenuItem, RowActions } from "@/components/app/row-actions";
import { useWorkspace } from "@/components/app/session";
import { StatusBadge } from "@/components/app/status-badge";
import { NextStep, RelatedDocuments, SummaryList } from "@/components/app/surfaces";
import { notify } from "@/components/app/toast";
import { InvoicePaper } from "@/components/features/invoices/invoice-paper";
import { ApiError, request } from "@/lib/api";
import { currencyAmount, daysUntil, formatDate, today } from "@/lib/format";
import { help } from "@/lib/help-content";
import type { Invoice } from "@/types/records";

const TODAY = today();

export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const { canManageRecords, currency } = useWorkspace();
  const confirm = useConfirm();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    void request<{ invoice: Invoice }>(`/api/invoices/${invoiceId}`)
      .then((data) => setInvoice(data.invoice))
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
            {canManageRecords && invoice.status !== "void" ? (
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
          { label: "應付總額", value: currencyAmount(currency, invoice.totalAmount) },
        ]}
      />

      {invoice.sourceQuoteId ? (
        <RelatedDocuments>
          <ButtonLink href={`/quotes/${invoice.sourceQuoteId}`} size="sm" variant="secondary">
            來源報價單 {invoice.sourceQuoteNumber}
          </ButtonLink>
        </RelatedDocuments>
      ) : null}

      <NextStep>{describeNextStep(invoice, canManageRecords, remaining)}</NextStep>

      <div className="doc-frame print-keep">
        <p className="doc-frame-label no-print">文件內容（這就是客戶會收到的 PDF）</p>
        <InvoicePaper currency={currency} invoice={invoice} />
      </div>
    </div>
  );
}

function describeNextStep(invoice: Invoice, canManage: boolean, remaining: number) {
  if (!canManage) return "你的角色可以查看與下載這張請款單，但不能變更狀態。";
  switch (invoice.effectiveStatus) {
    case "draft":
      return "先按「下載 PDF」傳給客戶，再回來標示為已發送。標示之後內容就會鎖定。";
    case "overdue":
      return `付款已逾期 ${Math.abs(remaining)} 天，建議聯絡客戶確認付款情況。`;
    case "unpaid":
      return `已發送，等待客戶在 ${formatDate(invoice.dueDate)} 前付款。收到款項後可到「收據」開立收據給客戶。`;
    case "partially_paid":
      return "已收到部分款項，剩餘金額仍在追蹤中。";
    case "paid":
      return "款項已全數收到。如果客戶需要收據，可以到「收據」開立一張。";
    case "void":
      return "這張請款單已作廢，只保留紀錄。需要重新請款請建立一張新的。";
    default:
      return "";
  }
}
