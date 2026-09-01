"use client";

import { ArrowDownRight, ArrowUpRight, BookOpenText, Plus } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/app/button";
import { DataTable, ListCard, type Column } from "@/components/app/data-table";
import { Modal } from "@/components/app/dialog";
import { EmptyState, FeatureDisabled, NoResults, ReadOnlyNotice } from "@/components/app/empty-state";
import { SkeletonRows } from "@/components/app/feedback";
import { Field, FormError, FormGrid, FormSection, SelectField } from "@/components/app/form";
import { ListToolbar, ToolbarSelect } from "@/components/app/list-toolbar";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { useWorkspace } from "@/components/app/session";
import { Stat, Stats } from "@/components/app/surfaces";
import { Tag } from "@/components/app/status-badge";
import { notify } from "@/components/app/toast";
import { useListQuery } from "@/components/app/use-list-query";
import { ApiError, request } from "@/lib/api";
import { currencyAmount, formatDate, today } from "@/lib/format";
import { help } from "@/lib/help-content";
import type { LedgerEntry, LedgerSummary } from "@/types/records";

const TODAY = today();
const filterDefaults = { type: "all" };

export function LedgerView() {
  const { canManageRecords, currency } = useWorkspace();
  const query = useListQuery({ basePath: "/ledger", filterDefaults });
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [summary, setSummary] = useState<LedgerSummary>({ balance: 0, expense: 0, income: 0 });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [composing, setComposing] = useState(false);
  const { apiQuery, page } = query;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      void request<{ entries?: LedgerEntry[]; summary?: LedgerSummary; total?: number; totalPages?: number }>(
        `/api/ledger?${apiQuery}`,
      )
        .then((data) => {
          setEntries(data.entries ?? []);
          setSummary(data.summary ?? { balance: 0, expense: 0, income: 0 });
          setTotal(data.total ?? 0);
          setTotalPages(data.totalPages ?? 1);
          setBlocked(null);
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.isForbidden) setBlocked(error.message);
          else notify.error("無法讀取收支紀錄", error instanceof Error ? error.message : undefined);
        })
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [apiQuery, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  const columns: Column<LedgerEntry>[] = [
    {
      card: "status",
      cell: (entry) => (
        <Tag tone={entry.type === "IN" ? "success" : "danger"}>
          {entry.type === "IN" ? (
            <ArrowUpRight aria-hidden="true" size={13} style={{ marginRight: 4 }} />
          ) : (
            <ArrowDownRight aria-hidden="true" size={13} style={{ marginRight: 4 }} />
          )}
          {entry.type === "IN" ? "收入" : "支出"}
        </Tag>
      ),
      header: "類型",
      key: "type",
      width: "110px",
    },
    {
      card: "primary",
      cell: (entry) => (
        <>
          <strong>{entry.description}</strong>
          {entry.source === "receipt" ? <small>由收據自動帶入，請在「收據」頁處理</small> : null}
        </>
      ),
      header: "說明",
      key: "description",
    },
    { card: "meta", cell: (entry) => formatDate(entry.date), header: "日期", key: "date", width: "140px" },
    {
      align: "end",
      card: "amount",
      cell: (entry) => (
        <strong style={{ color: entry.type === "IN" ? "var(--tone-success-fg)" : "var(--tone-danger-fg)" }}>
          {entry.type === "IN" ? "+" : "−"}
          {currencyAmount(currency, entry.amount)}
        </strong>
      ),
      header: "金額",
      key: "amount",
      width: "170px",
    },
  ];

  return (
    <div className="page">
      <PageHeader
        description="這裡看得到累計收入、支出與目前餘額。已確認收款的收據會自動列為收入，你只需要補記沒有開收據的收入與所有支出。"
        how={help.ledger}
        primaryAction={
          canManageRecords && !blocked ? (
            <Button icon={<Plus aria-hidden="true" size={16} />} onClick={() => setComposing(true)} variant="primary">
              新增收支紀錄
            </Button>
          ) : null
        }
        title="收支記帳"
      />

      {blocked ? (
        <ListCard>
          <FeatureDisabled feature="收支記帳" message={blocked} />
        </ListCard>
      ) : (
        <>
          {/* Amounts stay blank until they are known — a placeholder 0.00 reads
              as a real balance of zero. */}
          <Stats>
            <Stat
              hint="已確認收款的收據 ＋ 手動收入"
              label="累計收入"
              tone={summary.income ? "income" : undefined}
              value={loading ? "—" : currencyAmount(currency, summary.income)}
            />
            <Stat
              hint="所有手動記錄的支出"
              label="累計支出"
              tone={summary.expense ? "expense" : undefined}
              value={loading ? "—" : currencyAmount(currency, summary.expense)}
            />
            <Stat
              hint="收入減支出"
              label="目前餘額"
              value={loading ? "—" : currencyAmount(currency, summary.balance)}
            />
          </Stats>

          {!canManageRecords ? (
            <ReadOnlyNotice>你的角色可以查看所有收支紀錄與餘額，但不能新增紀錄。</ReadOnlyNotice>
          ) : null}

          <div style={{ marginTop: 18 }}>
            <ListToolbar
              filters={
                <ToolbarSelect
                  label="類型"
                  onChange={(value) => query.setFilter("type", value)}
                  options={[
                    { label: "全部", value: "all" },
                    { label: "只看收入", value: "IN" },
                    { label: "只看支出", value: "OUT" },
                  ]}
                  value={query.filters.type}
                />
              }
              onReset={query.isFiltered ? query.clear : undefined}
              onSearchChange={query.setDraftKeyword}
              resultLabel={loading ? "載入中…" : `共 ${total} 筆紀錄`}
              searchPlaceholder="搜尋說明、收據編號或付款人"
              searchValue={query.draftKeyword}
            />

            <ListCard
              footer={
                entries.length
                  ? "上方的累計數字包含全部紀錄。標示「由收據自動帶入」的紀錄請回到「收據」頁處理。"
                  : undefined
              }
            >
              {loading ? (
                <SkeletonRows label="正在載入收支紀錄" rows={6} />
              ) : entries.length ? (
                <DataTable
                  ariaLabel="收支紀錄"
                  columns={columns}
                  rowKey={(entry) => entry.id}
                  rows={entries}
                />
              ) : query.isFiltered ? (
                <NoResults onReset={query.clear} />
              ) : (
                <EmptyState
                  actions={
                    canManageRecords ? (
                      <Button
                        icon={<Plus aria-hidden="true" size={16} />}
                        onClick={() => setComposing(true)}
                        variant="primary"
                      >
                        記下第一筆收支
                      </Button>
                    ) : null
                  }
                  icon={BookOpenText}
                  title="還沒有任何收支紀錄"
                >
                  <p>記下收入與支出之後，這裡會即時算出餘額，讓你隨時知道手上還有多少現金。</p>
                  <p>已確認收款的收據會自動變成收入，所以這裡通常只需要補記支出。</p>
                </EmptyState>
              )}
            </ListCard>

            <Pagination disabled={loading} onPageChange={query.setPage} page={page} totalPages={totalPages} />
          </div>
        </>
      )}

      <LedgerEntryDialog
        currency={currency}
        onClose={() => setComposing(false)}
        onSaved={() => {
          setComposing(false);
          reload();
        }}
        open={composing}
      />
    </div>
  );
}

function LedgerEntryDialog({
  currency,
  onClose,
  onSaved,
  open,
}: {
  currency: string;
  onClose: () => void;
  onSaved: () => void;
  open: boolean;
}) {
  const [type, setType] = useState<"IN" | "OUT">("IN");
  const [date, setDate] = useState(TODAY);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setType("IN");
    setDate(TODAY);
    setDescription("");
    setAmount("");
    setErrors({});
    setMessage("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!date) found.date = "請選擇這筆收支實際發生的日期。";
    if (!description.trim()) found.description = "請輸入用途說明，例如：辦公室租金。";
    const value = Number(amount);
    if (!amount.trim()) found.amount = "請輸入金額。";
    else if (!Number.isFinite(value) || value <= 0) found.amount = "金額必須大於 0。";
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    setMessage("");
    try {
      await request("/api/ledger", {
        body: JSON.stringify({ amount: value, date, description: description.trim(), type }),
        method: "POST",
      });
      notify.success(
        type === "IN" ? "收入已記下" : "支出已記下",
        `${description.trim()}　${currencyAmount(currency, value)}。餘額已重新計算。`,
      );
      reset();
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法儲存這筆紀錄，請稍後再試一次。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      description="收入會增加餘額，支出會扣減餘額。已確認收款的收據不需要在這裡重複記錄。"
      footer={
        <>
          <Button
            onClick={() => {
              reset();
              onClose();
            }}
            variant="ghost"
          >
            取消
          </Button>
          <Button form="ledger-entry-form" pending={saving} pendingLabel="儲存中…" type="submit" variant="primary">
            儲存這筆紀錄
          </Button>
        </>
      }
      onClose={() => {
        reset();
        onClose();
      }}
      open={open}
      title="新增收支紀錄"
    >
      <form className="form" id="ledger-entry-form" onSubmit={(event) => void submit(event)}>
        <FormSection title="這是一筆什麼？">
          <FormGrid>
            <SelectField
              label="類型"
              onChange={(event) => setType(event.target.value as "IN" | "OUT")}
              required
              value={type}
            >
              <option value="IN">收入（增加餘額）</option>
              <option value="OUT">支出（扣減餘額）</option>
            </SelectField>
            <Field
              error={errors.date}
              hint="以實際發生的日期為準。"
              label="日期"
              onChange={(event) => setDate(event.target.value)}
              required
              type="date"
              value={date}
            />
            <Field
              error={errors.description}
              label="用途說明"
              maxLength={500}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={type === "IN" ? "客戶服務費" : "辦公室租金"}
              required
              span
              value={description}
            />
            <Field
              error={errors.amount}
              inputMode="decimal"
              label={`金額（${currency}）`}
              min="0.01"
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              required
              span
              step="0.01"
              type="number"
              value={amount}
            />
          </FormGrid>
        </FormSection>
        <FormError>{message}</FormError>
      </form>
    </Modal>
  );
}
