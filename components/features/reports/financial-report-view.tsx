"use client";

import { useEffect, useMemo, useState } from "react";

import { Card, Stat, Stats } from "@/components/app/surfaces";
import { Field, FormGrid } from "@/components/app/form";
import { FeatureDisabled } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { useWorkspace } from "@/components/app/session";
import { ApiError, request } from "@/lib/api";
import { currencyAmount, formatDate, today } from "@/lib/format";
import { help } from "@/lib/help-content";
import type { LedgerSummary } from "@/types/records";

const TODAY = today();

function monthRange(value: string) {
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  const first = `${value}-01`;
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { from: first, to: last };
}

const CURRENT_MONTH = TODAY.slice(0, 7);
const INITIAL_RANGE = monthRange(CURRENT_MONTH) ?? { from: TODAY, to: TODAY };

export function FinancialReportView() {
  const { currency } = useWorkspace();
  const [from, setFrom] = useState(INITIAL_RANGE.from);
  const [to, setTo] = useState(INITIAL_RANGE.to);
  const [summary, setSummary] = useState<LedgerSummary>({ balance: 0, expense: 0, income: 0 });
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<string | null>(null);
  const rangeIsValid = Boolean(from && to && from <= to);

  const period = useMemo(() => {
    if (!rangeIsValid) return "請選擇有效的開始及結束日期";
    return `${formatDate(from)} 至 ${formatDate(to)}`;
  }, [from, rangeIsValid, to]);

  useEffect(() => {
    if (!rangeIsValid) {
      setLoading(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ from, to });
      void request<{ summary?: LedgerSummary }>(`/api/ledger?${params}`)
        .then((data) => {
          setSummary(data.summary ?? { balance: 0, expense: 0, income: 0 });
          setBlocked(null);
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.isForbidden) setBlocked(error.message);
        })
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [from, rangeIsValid, to]);

  function setMonth(value: string) {
    const range = monthRange(value);
    if (!range) return;
    setFrom(range.from);
    setTo(range.to);
  }

  return (
    <div className="page">
      <PageHeader
        description="預設以本月查看收入與支出；也可以選擇任何日期區間，立即重算該期間的淨額。"
        how={help.reports}
        title="財務報表"
      />

      {blocked ? (
        <Card>
          <FeatureDisabled feature="財務報表" message={blocked} />
        </Card>
      ) : (
        <>
          <Card description="選擇月份會自動帶入整月；你也可以直接調整開始及結束日期。" title="報表期間">
            <FormGrid columns={3}>
              <Field label="月份" onChange={(event) => setMonth(event.target.value)} type="month" value={from.slice(0, 7)} />
              <Field label="開始日期" onChange={(event) => setFrom(event.target.value)} required type="date" value={from} />
              <Field
                error={from && to && from > to ? "結束日期不可早於開始日期。" : undefined}
                label="結束日期"
                onChange={(event) => setTo(event.target.value)}
                required
                type="date"
                value={to}
              />
            </FormGrid>
          </Card>

          <div style={{ marginTop: 18 }}>
            <Stats>
              <Stat
                hint="已確認收款的收據 ＋ 手動收入"
                label="收入"
                tone={summary.income ? "income" : undefined}
                value={loading ? "—" : currencyAmount(currency, summary.income)}
              />
              <Stat
                hint="此期間內記錄的所有支出"
                label="支出"
                tone={summary.expense ? "expense" : undefined}
                value={loading ? "—" : currencyAmount(currency, summary.expense)}
              />
              <Stat hint="收入減支出" label="淨額" value={loading ? "—" : currencyAmount(currency, summary.balance)} />
            </Stats>
          </div>

          <Card description="所有金額均只計入上方所選的日期區間。" title="收入與支出摘要">
            <dl className="summary">
              <div className="summary-item">
                <dt>期間</dt>
                <dd>{period}</dd>
              </div>
              <div className="summary-item">
                <dt>計算方式</dt>
                <dd>收入 − 支出 = 淨額</dd>
              </div>
            </dl>
          </Card>
        </>
      )}
    </div>
  );
}
