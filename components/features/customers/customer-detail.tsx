"use client";

import { Archive, ArchiveRestore, FileSignature, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button, ButtonLink } from "@/components/app/button";
import { useConfirm } from "@/components/app/confirm";
import { DataTable, ListCard, type Column } from "@/components/app/data-table";
import { EmptyState, FeatureDisabled } from "@/components/app/empty-state";
import { LoadError, SkeletonRows } from "@/components/app/feedback";
import { PageHeader } from "@/components/app/page-header";
import { useWorkspace } from "@/components/app/session";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, SummaryList } from "@/components/app/surfaces";
import { notify } from "@/components/app/toast";
import { CustomerFormDialog } from "@/components/features/customers/customer-form-dialog";
import { ApiError, request } from "@/lib/api";
import { currencyAmount, fallback, formatDate, formatDateTime, joinParts } from "@/lib/format";
import type { Customer } from "@/types/records";

type RelatedQuote = {
  id: string;
  issueDate: string;
  quoteNumber: string;
  status: string;
  totalAmount: number;
  updatedAt: string;
};

export function CustomerDetail({ customerId }: { customerId: string }) {
  const { canManageRecords, currency } = useWorkspace();
  const router = useRouter();
  const confirm = useConfirm();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [quotes, setQuotes] = useState<RelatedQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    void request<{ customer: Customer; quotations?: RelatedQuote[] }>(`/api/customers/${customerId}`)
      .then((data) => {
        setCustomer(data.customer);
        setQuotes(data.quotations ?? []);
      })
      .catch((error_: unknown) => {
        if (error_ instanceof ApiError && error_.isForbidden) setBlocked(error_.message);
        else setError(error_ instanceof Error ? error_.message : "無法讀取這位客戶的資料。");
      })
      .finally(() => setLoading(false));
  }, [customerId]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function toggleStatus() {
    if (!customer) return;
    const archiving = customer.status !== "archived";
    if (archiving) {
      const proceed = await confirm({
        confirmLabel: "封存客戶",
        consequence: `封存後，${customer.name} 不會再出現在新報價單與請款單的客戶選單。已開立的文件完全不受影響，之後也可以隨時重新啟用。`,
        title: `要封存 ${customer.name} 嗎？`,
      });
      if (!proceed) return;
    }
    try {
      await request(`/api/customers/${customer.id}`, {
        body: JSON.stringify({ status: archiving ? "archived" : "active" }),
        method: "PATCH",
      });
      notify.success(archiving ? `${customer.name} 已封存` : `${customer.name} 已重新啟用`);
      load();
    } catch (error_) {
      notify.error("無法更新客戶狀態", error_ instanceof Error ? error_.message : undefined);
    }
  }

  const crumbs = [
    { href: "/customers", label: "客戶" },
    { label: customer?.name ?? "載入中…" },
  ];

  if (blocked) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="客戶的聯絡資料與相關報價單。" title="客戶" />
        <ListCard>
          <FeatureDisabled feature="客戶主檔" message={blocked} />
        </ListCard>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="客戶的聯絡資料與相關報價單。" title="客戶" />
        <ListCard>
          <SkeletonRows label="正在載入客戶資料" rows={6} />
        </ListCard>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="page">
        <PageHeader crumbs={crumbs} description="客戶的聯絡資料與相關報價單。" title="客戶" />
        <LoadError message={error || "找不到這位客戶。"} onRetry={load} />
      </div>
    );
  }

  const quoteColumns: Column<RelatedQuote>[] = [
    {
      card: "primary",
      cell: (quote) => <strong>{quote.quoteNumber}</strong>,
      header: "報價單號",
      key: "number",
    },
    { card: "meta", cell: (quote) => formatDate(quote.issueDate), header: "開立日期", key: "date" },
    {
      align: "end",
      card: "amount",
      cell: (quote) => <strong>{currencyAmount(currency, quote.totalAmount)}</strong>,
      header: "總金額",
      key: "amount",
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
    <div className="page">
      <PageHeader
        crumbs={crumbs}
        description="這位客戶的聯絡資料，以及所有為他開立過的報價單。"
        primaryAction={
          canManageRecords ? (
            <Button icon={<Pencil aria-hidden="true" size={16} />} onClick={() => setEditing(true)} variant="primary">
              編輯客戶資料
            </Button>
          ) : null
        }
        secondaryActions={
          canManageRecords ? (
            <Button
              icon={
                customer.status === "archived" ? (
                  <ArchiveRestore aria-hidden="true" size={15} />
                ) : (
                  <Archive aria-hidden="true" size={15} />
                )
              }
              onClick={() => void toggleStatus()}
              variant="secondary"
            >
              {customer.status === "archived" ? "重新啟用" : "封存客戶"}
            </Button>
          ) : null
        }
        status={<StatusBadge domain="customer" value={customer.status ?? "active"} withHint />}
        title={customer.name}
      />

      <SummaryList
        items={[
          { label: "公司全名", value: fallback(customer.companyName) },
          { label: "聯絡人", value: fallback(customer.contact) },
          { label: "聯絡方式", value: fallback(joinParts([customer.phone, customer.email])) },
          { label: "商業登記號碼", value: fallback(customer.businessRegistration) },
        ]}
      />

      <div className="dash-grid">
        <ListCard>
          <div className="card-head">
            <div>
              <h2 className="card-title">相關報價單</h2>
              <p className="card-desc">為這位客戶開立過的報價單，點進去可以查看或繼續處理。</p>
            </div>
            {canManageRecords ? (
              <ButtonLink href="/quotes/new" icon={<Plus aria-hidden="true" size={15} />} size="sm" variant="secondary">
                建立報價單
              </ButtonLink>
            ) : null}
          </div>
          {quotes.length ? (
            <DataTable
              ariaLabel="相關報價單"
              columns={quoteColumns}
              rowHref={(quote) => `/quotes/${quote.id}`}
              rowKey={(quote) => quote.id}
              rows={quotes}
            />
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
              title="還沒有為這位客戶開過報價單"
            >
              <p>建立報價單時選擇這位客戶，之後所有相關報價都會集中列在這裡。</p>
            </EmptyState>
          )}
        </ListCard>

        <div className="dash-stack">
          <Card title="地址">
            <p className="field-hint" style={{ fontSize: 13, whiteSpace: "pre-line" }}>
              {fallback(customer.address)}
            </p>
          </Card>
          <Card description="只有你的團隊看得到，不會印在文件上。" title="內部備註">
            <p className="field-hint" style={{ fontSize: 13, whiteSpace: "pre-line" }}>
              {fallback(customer.notes)}
            </p>
          </Card>
          <Card title="紀錄">
            <SummaryList
              items={[
                { label: "建立時間", value: formatDateTime(customer.createdAt) },
                { label: "最後更新", value: formatDateTime(customer.updatedAt) },
              ]}
            />
          </Card>
        </div>
      </div>

      <CustomerFormDialog
        editing={customer}
        onClose={() => setEditing(false)}
        onSaved={(saved) => {
          setEditing(false);
          setCustomer(saved);
          router.refresh();
        }}
        open={editing}
      />
    </div>
  );
}
