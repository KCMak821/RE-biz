"use client";

import { FileSignature, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { ButtonLink } from "@/components/app/button";
import { DataTable, ListCard, type Column } from "@/components/app/data-table";
import { EmptyState, FeatureDisabled, NoResults, ReadOnlyNotice } from "@/components/app/empty-state";
import { SkeletonRows } from "@/components/app/feedback";
import { ListToolbar, ToolbarSelect } from "@/components/app/list-toolbar";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { useWorkspace } from "@/components/app/session";
import { StatusBadge } from "@/components/app/status-badge";
import { notify } from "@/components/app/toast";
import { useListQuery } from "@/components/app/use-list-query";
import { ApiError, request } from "@/lib/api";
import { currencyAmount, formatDate } from "@/lib/format";
import { help } from "@/lib/help-content";
import type { Quote } from "@/types/records";

const statusOptions = [
  { label: "全部狀態", value: "all" },
  { label: "草稿", value: "draft" },
  { label: "已發送", value: "sent" },
  { label: "已接受", value: "accepted" },
  { label: "已拒絕", value: "rejected" },
  { label: "已失效", value: "expired" },
];

const filterDefaults = { status: "all" };

export function QuoteList() {
  const { canManageRecords, currency } = useWorkspace();
  const query = useListQuery({ basePath: "/quotes", filterDefaults });

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAll, setTotalAll] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<string | null>(null);
  const { apiQuery, page } = query;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      void request<{ quotes?: Quote[]; total?: number; totalAll?: number; totalPages?: number }>(
        `/api/quotes?${apiQuery}`,
      )
        .then((data) => {
          setQuotes(data.quotes ?? []);
          setTotal(data.total ?? 0);
          setTotalAll(data.totalAll ?? 0);
          setTotalPages(data.totalPages ?? 1);
          setBlocked(null);
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.isForbidden) setBlocked(error.message);
          else notify.error("無法讀取報價單", error instanceof Error ? error.message : undefined);
        })
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [apiQuery]);

  const columns: Column<Quote>[] = [
    {
      card: "primary",
      cell: (quote) => <strong>{quote.quoteNumber}</strong>,
      header: "報價單號",
      key: "number",
      width: "180px",
    },
    {
      card: "meta",
      cell: (quote) => (
        <>
          {quote.customerSnapshot.companyName || quote.customerSnapshot.name}
          {quote.customerSnapshot.contact ? <small>{quote.customerSnapshot.contact}</small> : null}
        </>
      ),
      header: "客戶",
      key: "customer",
    },
    { card: "meta", cell: (quote) => formatDate(quote.issueDate), header: "開立日期", key: "issued" },
    { card: "meta", cell: (quote) => formatDate(quote.validUntil), header: "有效期限", key: "valid" },
    {
      align: "end",
      card: "amount",
      cell: (quote) => <strong>{currencyAmount(currency, quote.totalAmount)}</strong>,
      header: "總金額",
      key: "amount",
      width: "160px",
    },
    {
      card: "status",
      cell: (quote) => <StatusBadge domain="quote" value={quote.status} />,
      header: "狀態",
      key: "status",
      width: "120px",
    },
  ];

  return (
    <div className="page page-wide">
      <PageHeader
        description="報價單是成交前給客戶的價格文件。輸出 PDF 傳給客戶後，可以在這裡追蹤客戶是否接受；接受後可轉為請款單或收據。"
        how={help.quotes}
        primaryAction={
          canManageRecords && !blocked ? (
            <ButtonLink href="/quotes/new" icon={<Plus aria-hidden="true" size={16} />} variant="primary">
              建立報價單
            </ButtonLink>
          ) : null
        }
        title="報價單"
      />

      {blocked ? (
        <ListCard>
          <FeatureDisabled feature="報價單" message={blocked} />
        </ListCard>
      ) : (
        <>
          {!canManageRecords ? (
            <ReadOnlyNotice>你的角色可以查看報價單並輸出 PDF，但不能建立、編輯或變更狀態。</ReadOnlyNotice>
          ) : null}

          <ListToolbar
            filters={
              <ToolbarSelect
                label="狀態"
                onChange={(value) => query.setFilter("status", value)}
                options={statusOptions}
                value={query.filters.status}
              />
            }
            onReset={query.isFiltered ? query.clear : undefined}
            onSearchChange={query.setDraftKeyword}
            resultLabel={loading ? "載入中…" : `共 ${total} 張報價單`}
            searchPlaceholder="搜尋報價單號、客戶或聯絡人"
            searchValue={query.draftKeyword}
          />

          <ListCard>
            {loading ? (
              <SkeletonRows label="正在載入報價單" rows={6} />
            ) : quotes.length ? (
              <DataTable
                ariaLabel="報價單列表"
                columns={columns}
                rowActions={(quote) => (
                  <ButtonLink href={`/quotes/${quote.id}`} size="sm" variant="secondary">
                    {canManageRecords && quote.status === "draft" ? "繼續編輯" : "檢視"}
                  </ButtonLink>
                )}
                rowHref={(quote) => `/quotes/${quote.id}`}
                rowKey={(quote) => quote.id}
                rows={quotes}
              />
            ) : totalAll ? (
              <NoResults onReset={query.clear} />
            ) : (
              <EmptyState
                actions={
                  canManageRecords ? (
                    <ButtonLink href="/quotes/new" icon={<Plus aria-hidden="true" size={16} />} variant="primary">
                      建立第一張報價單
                    </ButtonLink>
                  ) : null
                }
                icon={FileSignature}
                title="還沒有建立任何報價單"
              >
                <p>建立報價單後，你可以輸出 PDF 傳給客戶，追蹤對方是否接受，並在接受後一鍵轉成請款單。</p>
                <p>不需要先建立客戶，也可以在建立報價單的過程中直接輸入。</p>
              </EmptyState>
            )}
          </ListCard>

          <Pagination disabled={loading} onPageChange={query.setPage} page={page} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}
