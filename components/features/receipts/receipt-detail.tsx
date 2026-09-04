"use client";

import { CircleCheck, FileDown, FileSignature, FileText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button, ButtonLink } from "@/components/app/button";
import { useConfirm } from "@/components/app/confirm";
import { FeatureDisabled } from "@/components/app/empty-state";
import { LoadError, SkeletonRows } from "@/components/app/feedback";
import { ListCard } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { useWorkspace } from "@/components/app/session";
import { StatusBadge } from "@/components/app/status-badge";
import { NextStep, RelatedDocuments, SummaryList } from "@/components/app/surfaces";
import { notify } from "@/components/app/toast";
import { ReceiptPaper } from "@/components/features/receipts/receipt-paper";
import { ApiError, request } from "@/lib/api";
import { currencyAmount, fallback, formatDate, formatDateTime } from "@/lib/format";
import { help } from "@/lib/help-content";
import { organizationLogoUrl, organizationSealUrl } from "@/lib/organization-assets";
import { draftFromSavedReceipt } from "@/lib/receipt-form";
import type { SavedReceipt } from "@/types/records";

/**
 * A receipt now has its own address, so a single receipt can be linked to or
 * bookmarked. It used to exist only as a preview dialog inside the list.
 */
export function ReceiptDetail({ receiptId }: { receiptId: string }) {
  const { canManageRecords, currency, organization } = useWorkspace();
  const confirm = useConfirm();

  const [receipt, setReceipt] = useState<SavedReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    void request<{ receipt: SavedReceipt }>(`/api/receipts/${receiptId}`)
      .then((data) => setReceipt(data.receipt))
      .catch((failure: unknown) => {
        if (failure instanceof ApiError && failure.isForbidden) setBlocked(failure.message);
        else setError(failure instanceof Error ? failure.message : "無法讀取這張收據。");
      })
      .finally(() => setLoading(false));
  }, [receiptId]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function confirmPayment() {
    if (!receipt) return;
    const proceed = await confirm({
      confirmLabel: "確認已收款",
      consequence: `確認後，${receipt.receiptNumber}（${currencyAmount(currency, receipt.amount)}）會列入「收支紀錄」，而且不能改回待收款。如果款項還沒實際入帳，請先保留現狀。`,
      title: `確認 ${receipt.payerName} 已付款？`,
    });
    if (!proceed) return;

    setWorking(true);
    try {
      await request(`/api/receipts/${receipt.id}`, {
        body: JSON.stringify({ paymentStatus: "paid" }),
        method: "PUT",
      });
      notify.success(`${receipt.receiptNumber} 已確認收款`, "這筆款項已列入收支紀錄。");
      load();
    } catch (failure) {
      notify.error("無法確認收款", failure instanceof Error ? failure.message : undefined);
    } finally {
      setWorking(false);
    }
  }

  const crumbs = [
    { href: "/receipts", label: "收據" },
    { label: receipt?.receiptNumber ?? "載入中…" },
  ];

  if (blocked) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="收據內容與收款狀態。" title="收據" />
        <ListCard>
          <FeatureDisabled feature="收據" message={blocked} />
        </ListCard>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="收據內容與收款狀態。" title="收據" />
        <ListCard>
          <SkeletonRows label="正在載入收據" rows={7} />
        </ListCard>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="收據內容與收款狀態。" title="收據" />
        <LoadError message={error || "找不到這張收據。"} onRetry={load} />
      </div>
    );
  }

  const pending = receipt.paymentStatus === "pending";

  return (
    <div className="page page-wide">
      <PageHeader
        crumbs={crumbs}
        description={`開給 ${receipt.payerName} 的收據，開立日期 ${formatDate(receipt.issueDate)}。`}
        how={help.receipts}
        primaryAction={
          canManageRecords && pending ? (
            <Button
              icon={<CircleCheck aria-hidden="true" size={16} />}
              onClick={() => void confirmPayment()}
              pending={working}
              variant="primary"
            >
              確認已收款
            </Button>
          ) : null
        }
        secondaryActions={
          <Button icon={<FileDown aria-hidden="true" size={15} />} onClick={() => window.print()} variant="secondary">
            下載 PDF
          </Button>
        }
        status={<StatusBadge domain="receipt" value={receipt.paymentStatus ?? "paid"} withHint />}
        title={receipt.receiptNumber}
      />

      <SummaryList
        items={[
          { label: "付款人", value: receipt.payerName },
          { label: "開立日期", value: formatDate(receipt.issueDate) },
          { label: "收款金額", value: currencyAmount(currency, receipt.amount) },
          { label: "付款方式", value: fallback(receipt.paymentMethod) },
          { label: "收款項目", value: fallback(receipt.description) },
          { label: "建立時間", value: formatDateTime(receipt.createdAt) },
          { label: "備註", value: fallback(receipt.notes) },
        ]}
      />

      {receipt.sourceQuoteId || receipt.sourceInvoiceId ? (
        <RelatedDocuments>
          {receipt.sourceInvoiceId ? (
            <ButtonLink
              href={`/invoices/${receipt.sourceInvoiceId}`}
              icon={<FileText aria-hidden="true" size={15} />}
              size="sm"
              variant="secondary"
            >
              來源請款單 {receipt.sourceInvoiceNumber}
            </ButtonLink>
          ) : null}
          {receipt.sourceQuoteId ? (
            <ButtonLink
              href={`/quotes/${receipt.sourceQuoteId}`}
              icon={<FileSignature aria-hidden="true" size={15} />}
              size="sm"
              variant="secondary"
            >
              來源報價單 {receipt.sourceQuoteNumber}
            </ButtonLink>
          ) : null}
        </RelatedDocuments>
      ) : null}

      <NextStep>
        {!canManageRecords
          ? "你的角色可以查看與下載這張收據，但不能確認收款。"
          : pending
            ? "這張收據由報價單建立，還沒收到款項。實際入帳後按「確認已收款」，金額就會列入收支紀錄。"
            : receipt.sourceInvoiceNumber
              ? `款項已收妥並列入收支紀錄，來源請款單 ${receipt.sourceInvoiceNumber}。需要再給客戶一份時，按「下載 PDF」即可。`
              : "款項已收妥並列入收支紀錄。需要再給客戶一份時，按「下載 PDF」即可。"}
      </NextStep>

      <div className="doc-frame print-keep">
        <p className="doc-frame-label no-print">收據內容（這就是客戶會收到的 PDF）</p>
        <ReceiptPaper
          currency={currency}
          logoUrl={organizationLogoUrl(organization)}
          receipt={draftFromSavedReceipt(receipt)}
          sealUrl={organizationSealUrl(organization)}
          template={receipt.receiptTemplateSnapshot ?? organization.receiptTemplate}
        />
      </div>
    </div>
  );
}
