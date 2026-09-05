"use client";

import { ArrowDownRight, ArrowUpRight, Download, ReceiptText } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/app/button";
import { DataTable, ListCard, type Column } from "@/components/app/data-table";
import { FeatureDisabled } from "@/components/app/empty-state";
import { Field, FormGrid } from "@/components/app/form";
import { ListToolbar, ToolbarSelect } from "@/components/app/list-toolbar";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { useWorkspace } from "@/components/app/session";
import { Card, Stat, Stats, SummaryList } from "@/components/app/surfaces";
import { Tag } from "@/components/app/status-badge";
import { ApiError, request } from "@/lib/api";
import { currencyAmount, formatDate, today } from "@/lib/format";
import type { FinancialReportResponse, LedgerEntry } from "@/types/records";

function currentMonthStart() {
  return `${today().slice(0, 7)}-01`;
}

const emptyReport: FinancialReportResponse = {
  entries: [], expense: 0, income: 0, manualIncome: 0, netAmount: 0, page: 1, receiptIncome: 0, total: 0, totalPages: 1, transactionCount: 0,
};

export function FinancialReportView() {
  const { currency } = useWorkspace();
  const [startDate, setStartDate] = useState(currentMonthStart);
  const [endDate, setEndDate] = useState(today);
  const [appliedPeriod, setAppliedPeriod] = useState({ startDate: currentMonthStart(), endDate: today() });
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<FinancialReportResponse>(emptyReport);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ ...appliedPeriod, page: String(page), type }).toString();
    setLoading(true);
    setError("");
    void request<FinancialReportResponse>(`/api/reports/financial?${params}`)
      .then((data) => { setReport(data); setBlocked(null); })
      .catch((reason: unknown) => {
        if (reason instanceof ApiError && reason.isForbidden) setBlocked(reason.message);
        else setError(reason instanceof Error ? reason.message : "無法讀取財務報表。");
      })
      .finally(() => setLoading(false));
  }, [appliedPeriod, page, type]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (startDate && endDate && startDate > endDate) {
      setError("開始日期不能晚於結束日期。");
      return;
    }
    setAppliedPeriod({ startDate, endDate });
    setPage(1);
  }

  /**
   * The workbook is a file, not JSON, so this bypasses the shared `request`
   * helper. It exports the period that is currently on screen — the whole
   * period, not the visible page, and both sides of the ledger regardless of
   * the 顯示項目 filter, because a 損益表 with one side missing would not add up.
   */
  async function exportWorkbook() {
    setExporting(true);
    setError("");
    try {
      const params = new URLSearchParams(appliedPeriod).toString();
      const response = await fetch(`/api/reports/financial/export?${params}`, { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data?.message === "string" ? data.message : "無法匯出財務報表。");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.download = `財務報表_${appliedPeriod.startDate}_${appliedPeriod.endDate}.xlsx`;
      link.href = url;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "無法匯出財務報表。");
    } finally {
      setExporting(false);
    }
  }

  const columns: Column<LedgerEntry>[] = [
    {
      card: "status", header: "收支", key: "type", width: "110px",
      cell: (entry) => <Tag tone={entry.type === "IN" ? "success" : "danger"}>
        {entry.type === "IN" ? <ArrowUpRight aria-hidden="true" size={13} style={{ marginRight: 4 }} /> : <ArrowDownRight aria-hidden="true" size={13} style={{ marginRight: 4 }} />}
        {entry.type === "IN" ? "收入" : "支出"}
      </Tag>,
    },
    {
      card: "primary", header: "項目／說明", key: "description",
      cell: (entry) => <><strong>{entry.description}</strong><small>{entry.source === "receipt" ? "已確認收款收據，自動認列" : "手動收支紀錄"}</small></>,
    },
    { card: "meta", cell: (entry) => formatDate(entry.date), header: "發生日期", key: "date", width: "140px" },
    { card: "meta", header: "來源", key: "source", width: "140px", cell: (entry) => entry.source === "receipt" ? "收據" : "手動記帳" },
    {
      align: "end", card: "amount", header: "金額", key: "amount", width: "170px",
      cell: (entry) => <strong style={{ color: entry.type === "IN" ? "var(--tone-success-fg)" : "var(--tone-danger-fg)" }}>
        {entry.type === "IN" ? "+" : "−"}{currencyAmount(currency, entry.amount)}
      </strong>,
    },
  ];

  return (
    <div className="page">
      <PageHeader
        description="按期間查看已認列的收入、支出與淨額。收入包括已確認收款的收據和手動收入；待收款收據不會提前列入。"
        secondaryActions={blocked ? undefined : (
          <Button
            disabled={loading}
            icon={<Download aria-hidden="true" size={15} />}
            onClick={() => void exportWorkbook()}
            pending={exporting}
            pendingLabel="匯出中…"
          >
            匯出 Excel
          </Button>
        )}
        title="財務報表"
      />
      {blocked ? <Card><FeatureDisabled feature="財務報表" message={blocked} /></Card> : <>
        <Card description="預設為本月；可調整日期後重新產生收支匯總。" title="報表期間">
          <form className="form" onSubmit={submit}>
            <FormGrid>
              <Field label="開始日期" onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} />
              <Field label="結束日期" onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} />
            </FormGrid>
            <div style={{ marginTop: 16 }}><Button pending={loading} pendingLabel="產生中…" type="submit" variant="primary">產生報表</Button></div>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
          </form>
        </Card>
        <div style={{ marginTop: 18 }}><Stats>
          <Stat hint="已確認收款收據＋手動收入" label="收入" tone="income" value={loading ? "—" : currencyAmount(currency, report.income)} />
          <Stat hint="此期間的手動支出紀錄" label="支出" tone="expense" value={loading ? "—" : currencyAmount(currency, report.expense)} />
          <Stat hint="收入減支出" label="淨額" value={loading ? "—" : currencyAmount(currency, report.netAmount)} />
        </Stats></div>
        <div style={{ marginTop: 18 }}><Card description="本表逐項列出此期間全部已認列的進出項，收入和支出均可回溯核對。" title="認列摘要">
          <SummaryList items={[
            { label: "收據收入", value: loading ? "—" : currencyAmount(currency, report.receiptIncome) },
            { label: "手動收入", value: loading ? "—" : currencyAmount(currency, report.manualIncome) },
            { label: "手動支出", value: loading ? "—" : currencyAmount(currency, report.expense) },
            { label: "納入的紀錄數", value: loading ? "—" : `${report.transactionCount} 筆` },
          ]} />
        </Card></div>
        <div style={{ marginTop: 18 }}>
          <ListToolbar
            filters={<ToolbarSelect label="顯示項目" onChange={(value) => { setType(value); setPage(1); }} options={[
              { label: "全部進出項", value: "all" }, { label: "只看收入", value: "IN" }, { label: "只看支出", value: "OUT" },
            ]} value={type} />}
            resultLabel={loading ? "載入中…" : `顯示 ${report.entries.length} 筆，共 ${report.total} 筆`}
          />
          <ListCard footer="收據收入只包括已確認收款的收據；待收款收據不會出現在本報表。">
            {report.entries.length ? <DataTable ariaLabel="財務報表交易明細" columns={columns} rowKey={(entry) => entry.id} rows={report.entries} /> :
              <div style={{ padding: 24, textAlign: "center" }}><ReceiptText aria-hidden="true" size={28} /><p>這個期間沒有符合條件的收支紀錄。</p></div>}
          </ListCard>
          <Pagination disabled={loading} onPageChange={setPage} page={report.page} totalPages={report.totalPages} />
        </div>
      </>}
    </div>
  );
}
