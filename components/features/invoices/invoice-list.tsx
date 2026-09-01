"use client";

import { FileText, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ButtonLink } from "@/components/app/button";
import { DataTable, ListCard, type Column } from "@/components/app/data-table";
import { EmptyState, FeatureDisabled, NoResults, ReadOnlyNotice } from "@/components/app/empty-state";
import { SkeletonRows } from "@/components/app/feedback";
import { ListToolbar, ToolbarSelect } from "@/components/app/list-toolbar";
import { PageHeader } from "@/components/app/page-header";
import { useWorkspace } from "@/components/app/session";
import { StatusBadge } from "@/components/app/status-badge";
import { notify } from "@/components/app/toast";
import { ApiError, request } from "@/lib/api";
import { currencyAmount, formatDate } from "@/lib/format";
import { help } from "@/lib/help-content";
import type { Invoice } from "@/types/records";

const statusOptions = [
  { label: "全部狀態", value: "all" },
  { label: "草稿", value: "draft" },
  { label: "未付款", value: "unpaid" },
  { label: "已逾期", value: "overdue" },
  { label: "部分付款", value: "partially_paid" },
  { label: "已付款", value: "paid" },
  { label: "已作廢", value: "void" },
];

export function InvoiceList() {
  const { canManageRecords, currency } = useWorkspace();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "all");

  const load = useCallback((status: string, search: string) => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (status !== "all") params.set("status", status);
    setLoading(true);
    void request<{ invoices?: Invoice[]; total?: number }>(`/api/invoices?${params}`)
      .then((data) => {
        setInvoices(data.invoices ?? []);
        setTotal(data.total ?? 0);
        setBlocked(null);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.isForbidden) setBlocked(error.message);
        else notify.error("無法讀取請款單", error instanceof Error ? error.message : undefined);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => load(statusFilter, keyword), keyword ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [keyword, load, statusFilter]);

  function changeStatus(next: string) {
    setStatusFilter(next);
    const params = new URLSearchParams();
    if (next !== "all") params.set("status", next);
    router.replace(params.size ? `/invoices?${params}` : "/invoices", { scroll: false });
  }

  const columns: Column<Invoice>[] = [
    {
      card: "primary",
      cell: (invoice) => (
        <>
          <strong>{invoice.invoiceNumber}</strong>
          {invoice.sourceQuoteNumber ? <small>來源報價單：{invoice.sourceQuoteNumber}</small> : null}
        </>
      ),
      header: "請款單號",
      key: "number",
      width: "190px",
    },
    {
      card: "meta",
      cell: (invoice) => invoice.customerSnapshot.companyName || invoice.customerSnapshot.name,
      header: "客戶",
      key: "customer",
    },
    { card: "meta", cell: (invoice) => formatDate(invoice.issueDate), header: "開立日期", key: "issued" },
    { card: "meta", cell: (invoice) => formatDate(invoice.dueDate), header: "付款到期日", key: "due" },
    {
      align: "end",
      card: "amount",
      cell: (invoice) => <strong>{currencyAmount(currency, invoice.totalAmount)}</strong>,
      header: "應付總額",
      key: "amount",
      width: "160px",
    },
    {
      card: "status",
      cell: (invoice) => <StatusBadge domain="invoice" value={invoice.effectiveStatus} />,
      header: "狀態",
      key: "status",
      width: "120px",
    },
  ];

  return (
    <div className="page page-wide">
      <PageHeader
        description="請款單是向客戶請款的付款通知。先以草稿確認客戶、到期日與金額，發送後用狀態追蹤付款情況。"
        how={help.invoices}
        primaryAction={
          canManageRecords && !blocked ? (
            <ButtonLink href="/invoices/new" icon={<Plus aria-hidden="true" size={16} />} variant="primary">
              建立請款單
            </ButtonLink>
          ) : null
        }
        title="請款單"
      />

      {blocked ? (
        <ListCard>
          <FeatureDisabled feature="請款單" message={blocked} />
        </ListCard>
      ) : (
        <>
          {!canManageRecords ? (
            <ReadOnlyNotice>你的角色可以查看請款單並輸出 PDF，但不能建立、編輯或變更狀態。</ReadOnlyNotice>
          ) : null}

          <ListToolbar
            filters={
              <ToolbarSelect label="狀態" onChange={changeStatus} options={statusOptions} value={statusFilter} />
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
              loading ? "載入中…" : total === null ? undefined : `顯示 ${invoices.length} 張，共 ${total} 張請款單`
            }
            searchPlaceholder="搜尋請款單號、客戶或聯絡人"
            searchValue={keyword}
          />

          <ListCard>
            {loading ? (
              <SkeletonRows label="正在載入請款單" rows={6} />
            ) : invoices.length ? (
              <DataTable
                ariaLabel="請款單列表"
                columns={columns}
                rowActions={(invoice) => (
                  <ButtonLink href={`/invoices/${invoice.id}`} size="sm" variant="secondary">
                    {canManageRecords && invoice.status === "draft" ? "繼續編輯" : "檢視"}
                  </ButtonLink>
                )}
                rowHref={(invoice) => `/invoices/${invoice.id}`}
                rowKey={(invoice) => invoice.id}
                rows={invoices}
              />
            ) : total ? (
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
                    <ButtonLink href="/invoices/new" icon={<Plus aria-hidden="true" size={16} />} variant="primary">
                      建立第一張請款單
                    </ButtonLink>
                  ) : null
                }
                icon={FileText}
                title="還沒有建立任何請款單"
              >
                <p>請款單讓你清楚追蹤哪些款項已經請、什麼時候到期、有沒有逾期。</p>
                <p>你也可以在客戶接受報價單之後，從報價單一鍵轉成請款單。</p>
              </EmptyState>
            )}
          </ListCard>
        </>
      )}
    </div>
  );
}
