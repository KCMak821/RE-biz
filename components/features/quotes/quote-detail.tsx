"use client";

import { Check, Copy, FileDown, FileText, Pencil, ReceiptText, Send, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
import { QuotePaper } from "@/components/features/quotes/quote-paper";
import { ApiError, request } from "@/lib/api";
import { currencyAmount, daysUntil, formatDate, today } from "@/lib/format";
import { help } from "@/lib/help-content";
import type { Quote, QuoteLinks } from "@/types/records";

const TODAY = today();

export function QuoteDetail({ quoteId }: { quoteId: string }) {
  const { canManageRecords, currency } = useWorkspace();
  const router = useRouter();
  const confirm = useConfirm();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [links, setLinks] = useState<QuoteLinks>({ invoice: null, receipt: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    void request<{ quote: Quote } & QuoteLinks>(`/api/quotes/${quoteId}`)
      .then((data) => {
        setQuote(data.quote);
        setLinks({ invoice: data.invoice, receipt: data.receipt });
      })
      .catch((failure: unknown) => {
        if (failure instanceof ApiError && failure.isForbidden) setBlocked(failure.message);
        else setError(failure instanceof Error ? failure.message : "無法讀取這張報價單。");
      })
      .finally(() => setLoading(false));
  }, [quoteId]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function changeStatus(next: "sent" | "accepted" | "rejected") {
    if (!quote) return;
    const dialog = {
      accepted: {
        confirmLabel: "標示為已接受",
        consequence: "確認後，這張報價單就可以一鍵轉成請款單或建立待收款的收據草稿。",
        danger: false,
        title: `客戶已接受 ${quote.quoteNumber}？`,
      },
      rejected: {
        confirmLabel: "標示為已拒絕",
        consequence: "標示後這張報價單會停留在「已拒絕」，不能回到草稿也不能再轉為請款單。紀錄會完整保留。",
        danger: true,
        title: `客戶已拒絕 ${quote.quoteNumber}？`,
      },
      sent: {
        confirmLabel: "標示為已發送",
        consequence: "標示後這張報價單就不能再編輯內容，因為客戶已經看到這個價格。需要修改時可以複製為新草稿。",
        danger: false,
        title: `已經把 ${quote.quoteNumber} 送給客戶了？`,
      },
    }[next];

    const proceed = await confirm(dialog);
    if (!proceed) return;

    setWorking(true);
    try {
      const data = await request<{ quote: Quote }>(`/api/quotes/${quote.id}`, {
        body: JSON.stringify({ action: "status", status: next }),
        method: "PUT",
      });
      setQuote(data.quote);
      notify.success(
        {
          accepted: `${quote.quoteNumber} 已標示為已接受`,
          rejected: `${quote.quoteNumber} 已標示為已拒絕`,
          sent: `${quote.quoteNumber} 已標示為已發送`,
        }[next],
        next === "accepted" ? "接下來可以轉為請款單，或建立待收款的收據草稿。" : undefined,
      );
    } catch (failure) {
      notify.error("無法更新狀態", failure instanceof Error ? failure.message : undefined);
    } finally {
      setWorking(false);
    }
  }

  async function duplicate() {
    if (!quote) return;
    setWorking(true);
    try {
      const data = await request<{ id: string }>(`/api/quotes/${quote.id}/duplicate`, { method: "POST" });
      notify.success("已複製為新的草稿報價單", "原本的報價單沒有改動。");
      router.push(`/quotes/${data.id}`);
    } catch (failure) {
      notify.error("無法複製報價單", failure instanceof Error ? failure.message : undefined);
    } finally {
      setWorking(false);
    }
  }

  async function createInvoice() {
    if (!quote) return;
    setWorking(true);
    try {
      const data = await request<{ invoice: { id: string; invoiceNumber: string } }>(
        `/api/quotes/${quote.id}/invoice`,
        { method: "POST" },
      );
      notify.successWithAction(
        `已建立請款單 ${data.invoice.invoiceNumber}`,
        { label: "開啟請款單", onClick: () => router.push(`/invoices/${data.invoice.id}`) },
        "目前是草稿，確認內容後再標示為已發送。",
      );
      load();
    } catch (failure) {
      notify.error("無法建立請款單", failure instanceof Error ? failure.message : undefined);
    } finally {
      setWorking(false);
    }
  }

  async function createReceiptDraft() {
    if (!quote) return;
    const proceed = await confirm({
      confirmLabel: "建立收據草稿",
      consequence:
        "會依這張報價單的品項建立一張「待收款」收據。它不會列入收入，直到你在收據頁按下「確認已收款」。每張報價單只能建立一次。",
      title: `要為 ${quote.quoteNumber} 建立收據草稿嗎？`,
    });
    if (!proceed) return;

    setWorking(true);
    try {
      const data = await request<{ receipt: { id: string; receiptNumber: string } }>(
        `/api/quotes/${quote.id}/receipt`,
        { method: "POST" },
      );
      notify.successWithAction(
        `已建立收據 ${data.receipt.receiptNumber}`,
        { label: "前往收據", onClick: () => router.push("/receipts?status=pending") },
        "狀態為待收款；實際收到款項後在收據頁確認收款。",
      );
      load();
    } catch (failure) {
      notify.error("無法建立收據草稿", failure instanceof Error ? failure.message : undefined);
    } finally {
      setWorking(false);
    }
  }

  const crumbs = [
    { href: "/quotes", label: "報價單" },
    { label: quote?.quoteNumber ?? "載入中…" },
  ];

  if (blocked) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="報價單內容與後續操作。" title="報價單" />
        <div className="card">
          <FeatureDisabled feature="報價單" message={blocked} />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="報價單內容與後續操作。" title="報價單" />
        <div className="card">
          <SkeletonRows label="正在載入報價單" rows={8} />
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="報價單內容與後續操作。" title="報價單" />
        <LoadError message={error || "找不到這張報價單。"} onRetry={load} />
      </div>
    );
  }

  const remaining = daysUntil(quote.validUntil, TODAY);
  const nextStep = describeNextStep(quote, links, canManageRecords, remaining);

  /* Exactly one primary action, decided by the state the document is in. */
  const primaryAction = !canManageRecords
    ? null
    : quote.status === "draft" ? (
        <Button
          icon={<Send aria-hidden="true" size={16} />}
          onClick={() => void changeStatus("sent")}
          pending={working}
          variant="primary"
        >
          標示為已發送
        </Button>
      ) : quote.status === "sent" ? (
        <Button
          icon={<Check aria-hidden="true" size={16} />}
          onClick={() => void changeStatus("accepted")}
          pending={working}
          variant="primary"
        >
          客戶已接受
        </Button>
      ) : quote.status === "accepted" && !links.invoice && !links.receipt ? (
        <Button
          icon={<FileText aria-hidden="true" size={16} />}
          onClick={() => void createInvoice()}
          pending={working}
          variant="primary"
        >
          轉為請款單
        </Button>
      ) : quote.status === "accepted" && !links.invoice && links.receipt ? (
        <ButtonLink
          href={`/receipts/${links.receipt.id}`}
          icon={<ReceiptText aria-hidden="true" size={16} />}
          variant="primary"
        >
          開啟收據 {links.receipt.receiptNumber}
        </ButtonLink>
      ) : links.invoice ? (
        <ButtonLink href={`/invoices/${links.invoice.id}`} icon={<FileText aria-hidden="true" size={16} />} variant="primary">
          開啟請款單 {links.invoice.invoiceNumber}
        </ButtonLink>
      ) : null;

  return (
    <div className="page page-wide">
      <PageHeader
        crumbs={crumbs}
        description={`開給 ${quote.customerSnapshot.companyName || quote.customerSnapshot.name} 的報價，有效期限至 ${formatDate(quote.validUntil)}。`}
        how={help.quotes}
        primaryAction={primaryAction}
        secondaryActions={
          <>
            <Button icon={<FileDown aria-hidden="true" size={15} />} onClick={() => window.print()} variant="secondary">
              下載 PDF
            </Button>
            {canManageRecords && quote.status === "draft" ? (
              <ButtonLink
                href={`/quotes/${quote.id}/edit`}
                icon={<Pencil aria-hidden="true" size={15} />}
                variant="secondary"
              >
                編輯
              </ButtonLink>
            ) : null}
            {canManageRecords ? (
              <RowActions
                menu={
                  <>
                    <MenuItem icon={<Copy aria-hidden="true" size={15} />} onClick={() => void duplicate()}>
                      複製為新草稿
                    </MenuItem>
                    {quote.status === "accepted" && !links.receipt && !links.invoice ? (
                      <MenuItem
                        icon={<ReceiptText aria-hidden="true" size={15} />}
                        onClick={() => void createReceiptDraft()}
                      >
                        建立收據草稿
                      </MenuItem>
                    ) : null}
                    {quote.status === "sent" ? (
                      <MenuItem danger icon={<X aria-hidden="true" size={15} />} onClick={() => void changeStatus("rejected")}>
                        客戶已拒絕
                      </MenuItem>
                    ) : null}
                  </>
                }
              />
            ) : null}
          </>
        }
        status={<StatusBadge domain="quote" value={quote.status} withHint />}
        title={quote.quoteNumber}
      />

      <SummaryList
        items={[
          { label: "客戶", value: quote.customerSnapshot.companyName || quote.customerSnapshot.name },
          { label: "開立日期", value: formatDate(quote.issueDate) },
          {
            label: "有效期限",
            value:
              quote.status === "expired"
                ? `${formatDate(quote.validUntil)}（已過期）`
                : Number.isFinite(remaining) && remaining >= 0
                  ? `${formatDate(quote.validUntil)}（還有 ${remaining} 天）`
                  : formatDate(quote.validUntil),
          },
          { label: "總金額", value: currencyAmount(currency, quote.totalAmount) },
        ]}
      />

      {links.invoice || links.receipt ? (
        <RelatedDocuments>
          {links.invoice ? (
            <ButtonLink href={`/invoices/${links.invoice.id}`} size="sm" variant="secondary">
              請款單 {links.invoice.invoiceNumber}
            </ButtonLink>
          ) : null}
          {links.receipt ? (
            <ButtonLink href={`/receipts/${links.receipt.id}`} size="sm" variant="secondary">
              收據 {links.receipt.receiptNumber}
              {links.receipt.paymentStatus === "paid" ? "（已收款）" : "（待收款）"}
            </ButtonLink>
          ) : null}
        </RelatedDocuments>
      ) : null}

      {nextStep ? <NextStep>{nextStep}</NextStep> : null}

      <div className="doc-frame print-keep">
        <p className="doc-frame-label no-print">文件內容（這就是客戶會收到的 PDF）</p>
        <QuotePaper quote={quote} />
      </div>
    </div>
  );
}

function describeNextStep(quote: Quote, links: QuoteLinks, canManage: boolean, remaining: number) {
  if (!canManage) return "你的角色可以查看與下載這張報價單，但不能變更狀態。";
  if (quote.status === "draft")
    return "先按「下載 PDF」傳給客戶，再回來標示為已發送。標示之後內容就會鎖定。";
  if (quote.status === "sent")
    return Number.isFinite(remaining) && remaining <= 7
      ? `等待客戶回覆中，${remaining >= 0 ? `還有 ${remaining} 天到期` : "已過期"}。可以主動聯絡客戶確認。`
      : "等待客戶回覆。收到答覆後標示為已接受，或在「更多」中標示為已拒絕。";
  if (quote.status === "accepted" && links.invoice)
    return `已建立請款單 ${links.invoice.invoiceNumber}，接下來的付款追蹤與收據都在請款單上進行。`;
  if (quote.status === "accepted" && links.receipt)
    return `已直接開立收據 ${links.receipt.receiptNumber}，這筆交易不需要再開請款單。`;
  if (quote.status === "accepted")
    return "客戶已接受。需要請款流程就「轉為請款單」；客戶當場付款則在「更多」中直接建立收據。兩條路只能擇一。";
  if (quote.status === "rejected") return "這張報價單已結束。需要重新報價時可以「複製為新草稿」調整價格。";
  if (quote.status === "expired") return "已過有效期限，不能再變更狀態。需要延期請「複製為新草稿」並設定新的有效期限。";
  return null;
}
