"use client";

import { CircleCheck, FileDown, Plus, ReceiptText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button, ButtonLink } from "@/components/app/button";
import { useConfirm } from "@/components/app/confirm";
import { DataTable, ListCard, type Column } from "@/components/app/data-table";
import { EmptyState, FeatureDisabled, NoResults, ReadOnlyNotice } from "@/components/app/empty-state";
import { SkeletonRows } from "@/components/app/feedback";
import { ListToolbar, ToolbarSelect } from "@/components/app/list-toolbar";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { MenuLink, RowActions } from "@/components/app/row-actions";
import { useWorkspace } from "@/components/app/session";
import { StatusBadge } from "@/components/app/status-badge";
import { notify } from "@/components/app/toast";
import { useListQuery } from "@/components/app/use-list-query";
import { ReceiptPaper } from "@/components/features/receipts/receipt-paper";
import { ApiError, request } from "@/lib/api";
import { currencyAmount, formatDate } from "@/lib/format";
import { help } from "@/lib/help-content";
import { organizationLogoUrl, organizationSealUrl } from "@/lib/organization-assets";
import { draftFromSavedReceipt } from "@/lib/receipt-form";
import type { SavedReceipt } from "@/types/records";

const filterDefaults = { status: "all" };

const statusOptions = [
  { label: "全部", value: "all" },
  { label: "待收款", value: "pending" },
  { label: "已收款", value: "paid" },
];

export function ReceiptList() {
  const { canManageRecords, currency, organization } = useWorkspace();
  const confirm = useConfirm();
  const query = useListQuery({ basePath: "/receipts", filterDefaults });

  const [receipts, setReceipts] = useState<SavedReceipt[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [printing, setPrinting] = useState<SavedReceipt | null>(null);
  const [version, setVersion] = useState(0);

  const logoUrl = organizationLogoUrl(organization);
  const sealUrl = organizationSealUrl(organization);
  const { apiQuery, page } = query;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      void request<{ receipts?: SavedReceipt[]; total?: number; totalPages?: number }>(`/api/receipts?${apiQuery}`)
        .then((data) => {
          setReceipts(data.receipts ?? []);
          setTotal(data.total ?? 0);
          setTotalPages(data.totalPages ?? 1);
          setBlocked(null);
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.isForbidden) setBlocked(error.message);
          else notify.error("無法讀取收據", error instanceof Error ? error.message : undefined);
        })
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [apiQuery, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  async function confirmPayment(receipt: SavedReceipt) {
    const proceed = await confirm({
      confirmLabel: "確認已收款",
      consequence: `確認後，${receipt.receiptNumber}（${currencyAmount(currency, receipt.amount)}）會列入「收支記帳」的收入，而且不能改回待收款。如果款項還沒實際入帳，請先保留現狀。`,
      title: `確認 ${receipt.payerName} 已付款？`,
    });
    if (!proceed) return;

    setConfirming(receipt.id);
    try {
      await request(`/api/receipts/${receipt.id}`, {
        body: JSON.stringify({ paymentStatus: "paid" }),
        method: "PUT",
      });
      notify.success(`${receipt.receiptNumber} 已確認收款`, "這筆款項已列入收支記帳的收入。");
      reload();
    } catch (error) {
      notify.error("無法確認收款", error instanceof Error ? error.message : undefined);
    } finally {
      setConfirming(null);
    }
  }

  function print(receipt: SavedReceipt) {
    setPrinting(receipt);
    window.setTimeout(() => window.print(), 120);
  }

  const columns: Column<SavedReceipt>[] = [
    {
      card: "primary",
      cell: (receipt) => (
        <>
          <strong>{receipt.receiptNumber}</strong>
          {receipt.sourceQuoteNumber ? <small>來源報價單：{receipt.sourceQuoteNumber}</small> : null}
        </>
      ),
      header: "收據編號",
      key: "number",
    },
    {
      card: "meta",
      cell: (receipt) => (
        <>
          {receipt.payerName}
          <small>{receipt.description}</small>
        </>
      ),
      header: "付款人",
      key: "payer",
    },
    { card: "meta", cell: (receipt) => formatDate(receipt.issueDate), header: "開立日期", key: "date" },
    {
      align: "end",
      card: "amount",
      cell: (receipt) => <strong>{currencyAmount(currency, receipt.amount)}</strong>,
      header: "金額",
      key: "amount",
    },
    {
      card: "status",
      cell: (receipt) => <StatusBadge domain="receipt" value={receipt.paymentStatus ?? "paid"} />,
      header: "收款狀態",
      key: "status",
    },
  ];

  return (
    <div className="page">
      <PageHeader
        description="這裡管理你開立過的收據。可以重新輸出 PDF，也可以把由報價單建立的草稿收據標示為已收款。"
        how={help.receipts}
        primaryAction={
          canManageRecords ? (
            <ButtonLink href="/receipts/new" icon={<Plus aria-hidden="true" size={16} />} variant="primary">
              開立收據
            </ButtonLink>
          ) : null
        }
        title="收據"
      />

      {blocked ? (
        <ListCard>
          <FeatureDisabled feature="收據" message={blocked} />
        </ListCard>
      ) : (
        <>
          {!canManageRecords ? (
            <ReadOnlyNotice>你的角色可以查看所有收據並輸出 PDF，但不能開立新收據或確認收款。</ReadOnlyNotice>
          ) : null}

          <ListToolbar
            filters={
              <ToolbarSelect
                label="收款狀態"
                onChange={(value) => query.setFilter("status", value)}
                options={statusOptions}
                value={query.filters.status}
              />
            }
            onReset={query.isFiltered ? query.clear : undefined}
            onSearchChange={query.setDraftKeyword}
            resultLabel={loading ? "載入中…" : `共 ${total} 張收據`}
            searchPlaceholder="搜尋收據編號、付款人或項目"
            searchValue={query.draftKeyword}
          />

          <ListCard>
            {loading ? (
              <SkeletonRows label="正在載入收據" rows={6} />
            ) : receipts.length ? (
              <DataTable
                ariaLabel="收據列表"
                columns={columns}
                rowActions={(receipt) => (
                  <RowActions
                    menu={
                      <>
                        <MenuLink href={`/receipts/${receipt.id}`}>檢視收據</MenuLink>
                        {canManageRecords && receipt.paymentStatus === "pending" ? (
                          <MenuItemConfirmPayment
                            disabled={confirming === receipt.id}
                            onConfirm={() => void confirmPayment(receipt)}
                          />
                        ) : null}
                      </>
                    }
                  >
                    <Button
                      icon={<FileDown aria-hidden="true" size={14} />}
                      onClick={() => print(receipt)}
                      size="sm"
                      variant="secondary"
                    >
                      下載 PDF
                    </Button>
                  </RowActions>
                )}
                rowHref={(receipt) => `/receipts/${receipt.id}`}
                rowKey={(receipt) => receipt.id}
                rows={receipts}
              />
            ) : query.isFiltered ? (
              <NoResults onReset={query.clear} />
            ) : (
              <EmptyState
                actions={
                  canManageRecords ? (
                    <ButtonLink href="/receipts/new" icon={<Plus aria-hidden="true" size={16} />} variant="primary">
                      開立第一張收據
                    </ButtonLink>
                  ) : null
                }
                icon={ReceiptText}
                title="還沒有開立任何收據"
              >
                <p>開立收據後，你可以在這裡重新下載 PDF、追蹤哪些款項還沒收到，收入也會自動進入收支記帳。</p>
                <p>{canManageRecords ? "第一次開立大約需要一分鐘。" : "目前沒有可查看的收據。"}</p>
              </EmptyState>
            )}
          </ListCard>

          <Pagination disabled={loading} onPageChange={query.setPage} page={page} totalPages={totalPages} />
        </>
      )}

      <div className="print-only">
        {printing ? (
          <ReceiptPaper
            currency={currency}
            logoUrl={logoUrl}
            receipt={draftFromSavedReceipt(printing)}
            sealUrl={sealUrl}
            template={printing.receiptTemplateSnapshot ?? organization.receiptTemplate}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Split out so the row menu stays readable. */
function MenuItemConfirmPayment({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  return (
    <button className="row-menu-item" disabled={disabled} onClick={onConfirm} role="menuitem" type="button">
      <CircleCheck aria-hidden="true" size={15} />
      確認已收款
    </button>
  );
}
