"use client";

import { CircleCheck, Eye, FileDown, Plus, ReceiptText } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button, ButtonLink } from "@/components/app/button";
import { useConfirm } from "@/components/app/confirm";
import { DataTable, ListCard, type Column } from "@/components/app/data-table";
import { Modal } from "@/components/app/dialog";
import { EmptyState, FeatureDisabled, NoResults, ReadOnlyNotice } from "@/components/app/empty-state";
import { SkeletonRows } from "@/components/app/feedback";
import { ListToolbar, ToolbarSelect } from "@/components/app/list-toolbar";
import { PageHeader } from "@/components/app/page-header";
import { MenuItem, RowActions } from "@/components/app/row-actions";
import { useWorkspace } from "@/components/app/session";
import { StatusBadge } from "@/components/app/status-badge";
import { notify } from "@/components/app/toast";
import { ReceiptPaper } from "@/components/features/receipts/receipt-paper";
import { ApiError, request } from "@/lib/api";
import { currencyAmount, formatDate } from "@/lib/format";
import { help } from "@/lib/help-content";
import { organizationLogoUrl, organizationSealUrl } from "@/lib/organization-assets";
import { draftFromSavedReceipt } from "@/lib/receipt-form";
import type { SavedReceipt } from "@/types/records";

const RECEIPT_PAGE_SIZE = 20;

export function ReceiptList() {
  const { canManageRecords, currency, organization } = useWorkspace();
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirm = useConfirm();

  const [receipts, setReceipts] = useState<SavedReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "all");
  const [preview, setPreview] = useState<SavedReceipt | null>(null);
  const [printing, setPrinting] = useState<SavedReceipt | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const logoUrl = organizationLogoUrl(organization);
  const sealUrl = organizationSealUrl(organization);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      void request<{ receipts?: SavedReceipt[] }>("/api/receipts")
        .then((data) => {
          setReceipts(data.receipts ?? []);
          setBlocked(null);
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.isForbidden) setBlocked(error.message);
          else notify.error("無法讀取收據", error instanceof Error ? error.message : undefined);
        })
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function changeStatus(next: string) {
    setStatusFilter(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("status");
    else params.set("status", next);
    router.replace(params.size ? `/receipts?${params}` : "/receipts", { scroll: false });
  }

  const filtered = useMemo(() => {
    const search = keyword.trim().toLowerCase();
    return receipts.filter((receipt) => {
      const paid = receipt.paymentStatus !== "pending";
      if (statusFilter === "pending" && paid) return false;
      if (statusFilter === "paid" && !paid) return false;
      if (!search) return true;
      return [receipt.receiptNumber, receipt.payerName, receipt.description]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [keyword, receipts, statusFilter]);

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
      setReceipts((current) =>
        current.map((item) => (item.id === receipt.id ? { ...item, paymentStatus: "paid" } : item)),
      );
      notify.success(`${receipt.receiptNumber} 已確認收款`, "這筆款項已列入收支記帳的收入。");
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
                onChange={changeStatus}
                options={[
                  { label: "全部", value: "all" },
                  { label: "待收款", value: "pending" },
                  { label: "已收款", value: "paid" },
                ]}
                value={statusFilter}
              />
            }
            onReset={
              keyword || statusFilter !== "all"
                ? () => {
                    setKeyword("");
                    changeStatus("all");
                  }
                : undefined
            }
            onSearchChange={setKeyword}
            resultLabel={
              loading
                ? "載入中…"
                : `顯示 ${filtered.length} 筆，系統保留最近 ${RECEIPT_PAGE_SIZE} 張收據`
            }
            searchPlaceholder="搜尋收據編號、付款人或項目"
            searchValue={keyword}
          />

          <ListCard>
            {loading ? (
              <SkeletonRows label="正在載入收據" rows={6} />
            ) : filtered.length ? (
              <DataTable
                ariaLabel="收據列表"
                columns={columns}
                rowActions={(receipt) => (
                  <RowActions
                    menu={
                      <>
                        <MenuItem
                          icon={<Eye aria-hidden="true" size={15} />}
                          onClick={() => setPreview(receipt)}
                        >
                          檢視收據內容
                        </MenuItem>
                        {canManageRecords && receipt.paymentStatus === "pending" ? (
                          <MenuItem
                            disabled={confirming === receipt.id}
                            icon={<CircleCheck aria-hidden="true" size={15} />}
                            onClick={() => void confirmPayment(receipt)}
                          >
                            確認已收款
                          </MenuItem>
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
                rowKey={(receipt) => receipt.id}
                rows={filtered}
              />
            ) : receipts.length ? (
              <NoResults
                onReset={() => {
                  setKeyword("");
                  changeStatus("all");
                }}
              />
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
        </>
      )}

      <Modal
        description={preview ? `${preview.payerName} · ${formatDate(preview.issueDate)}` : undefined}
        footer={
          preview ? (
            <>
              <Button onClick={() => setPreview(null)} variant="ghost">
                關閉
              </Button>
              <Button
                icon={<FileDown aria-hidden="true" size={15} />}
                onClick={() => {
                  const target = preview;
                  setPreview(null);
                  window.setTimeout(() => print(target), 80);
                }}
                variant="primary"
              >
                下載 PDF
              </Button>
            </>
          ) : null
        }
        onClose={() => setPreview(null)}
        open={Boolean(preview)}
        title={preview?.receiptNumber ?? "收據內容"}
        wide
      >
        {preview ? (
          <ReceiptPaper
            currency={currency}
            logoUrl={logoUrl}
            receipt={draftFromSavedReceipt(preview)}
            sealUrl={sealUrl}
            template={organization.receiptTemplate}
          />
        ) : null}
      </Modal>

      <div className="print-only">
        {printing ? (
          <ReceiptPaper
            currency={currency}
            logoUrl={logoUrl}
            receipt={draftFromSavedReceipt(printing)}
            sealUrl={sealUrl}
            template={organization.receiptTemplate}
          />
        ) : null}
      </div>
    </div>
  );
}
