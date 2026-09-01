"use client";

import {
  BookOpenText,
  Clock,
  FileSignature,
  FileText,
  Plus,
  ReceiptText,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { Button, ButtonLink } from "@/components/app/button";
import { EmptyState } from "@/components/app/empty-state";
import { Callout, SkeletonRows } from "@/components/app/feedback";
import { FormActions } from "@/components/app/form";
import { PageHeader } from "@/components/app/page-header";
import { useWorkspace } from "@/components/app/session";
import { Card, Stat, Stats, SummaryList } from "@/components/app/surfaces";
import { ApiError, request } from "@/lib/api";
import { currencyAmount, daysUntil, formatDate, today } from "@/lib/format";
import { help } from "@/lib/help-content";
import { roleDescriptions, roleLabel } from "@/lib/status";
import type { Invoice, LedgerEntry, LedgerSummary, Quote, SavedReceipt } from "@/types/records";

/** Held at module scope so render stays free of clock reads. */
const TODAY = today();
const EXPIRY_WINDOW_DAYS = 7;

/**
 * Only a 403 means "this workspace cannot use the feature". Everything else is a
 * real failure that has to be shown and retried, not silently swallowed.
 */
type ModuleResult<T> =
  | { data: T; kind: "ok" }
  | { kind: "unavailable" }
  | { kind: "failed"; message: string };

type Loaded = {
  invoices: ModuleResult<Invoice[]>;
  ledger: ModuleResult<{ entries: LedgerEntry[]; summary: LedgerSummary }>;
  quotes: ModuleResult<Quote[]>;
  receipts: ModuleResult<SavedReceipt[]>;
};

const LOADING: Loaded = {
  invoices: { kind: "unavailable" },
  ledger: { kind: "unavailable" },
  quotes: { kind: "unavailable" },
  receipts: { kind: "unavailable" },
};

/** Reads a module's data, keeping "switched off" and "broken" distinguishable. */
async function loadModule<Payload, Value>(
  url: string,
  pick: (payload: Payload) => Value,
): Promise<ModuleResult<Value>> {
  try {
    return { data: pick(await request<Payload>(url)), kind: "ok" };
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) return { kind: "unavailable" };
    return {
      kind: "failed",
      message: error instanceof Error ? error.message : "資料暫時無法載入，請稍後再試。",
    };
  }
}

function dataOf<T>(result: ModuleResult<T>, fallbackValue: T): T {
  return result.kind === "ok" ? result.data : fallbackValue;
}

type Activity = { amount?: number; at: string; href: string; icon: ReactNode; kind: string; title: string };

/**
 * The dashboard answers four questions: what needs doing today, what happened
 * recently, is anything wrong, and where are the things I use most. Every number
 * here comes from an endpoint that already existed — nothing is invented.
 */
export function DashboardView() {
  const { canManageRecords, canManageSettings, currency, features, organization, role, user } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Loaded>(LOADING);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      void Promise.all([
        loadModule<{ receipts?: SavedReceipt[] }, SavedReceipt[]>("/api/receipts", (payload) => payload.receipts ?? []),
        loadModule<{ entries?: LedgerEntry[]; summary?: LedgerSummary }, { entries: LedgerEntry[]; summary: LedgerSummary }>(
          "/api/ledger",
          (payload) => ({
            entries: payload.entries ?? [],
            summary: payload.summary ?? { balance: 0, expense: 0, income: 0 },
          }),
        ),
        loadModule<{ quotes?: Quote[] }, Quote[]>("/api/quotes", (payload) => payload.quotes ?? []),
        loadModule<{ invoices?: Invoice[] }, Invoice[]>("/api/invoices", (payload) => payload.invoices ?? []),
      ]).then(([receipts, ledger, quotes, invoices]) => {
        setData({ invoices, ledger, quotes, receipts });
        setLoading(false);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [version]);

  const receipts = dataOf(data.receipts, []);
  const quotes = dataOf(data.quotes, []);
  const invoices = dataOf(data.invoices, []);
  const ledger = data.ledger.kind === "ok" ? data.ledger.data : null;
  const failures = (
    [
      ["收據", data.receipts],
      ["收支記帳", data.ledger],
      ["報價單", data.quotes],
      ["請款單", data.invoices],
    ] as const
  ).flatMap(([label, result]) => (result.kind === "failed" ? [{ label, message: result.message }] : []));

  const pendingReceipts = receipts.filter((receipt) => receipt.paymentStatus === "pending");
  const awaitingQuotes = quotes.filter((quote) => quote.status === "sent");
  const expiringQuotes = awaitingQuotes.filter((quote) => {
    const days = daysUntil(quote.validUntil, TODAY);
    return Number.isFinite(days) && days >= 0 && days <= EXPIRY_WINDOW_DAYS;
  });
  const acceptedQuotes = quotes.filter((quote) => quote.status === "accepted" && !quote.invoiceId);
  const overdueInvoices = invoices.filter((invoice) => invoice.effectiveStatus === "overdue");
  const unpaidInvoices = invoices.filter((invoice) => invoice.effectiveStatus === "unpaid");
  const draftInvoices = invoices.filter((invoice) => invoice.effectiveStatus === "draft");
  // effectiveStatus already excludes fully paid invoices from unpaid/overdue,
  // but a partly paid one still has money outstanding.
  const partiallyPaidInvoices = invoices.filter((invoice) => invoice.effectiveStatus === "partially_paid");

  const todos = [
    overdueInvoices.length && {
      action: "查看逾期請款單",
      count: overdueInvoices.length,
      description: "已超過到期日仍未收到款項，建議先跟客戶確認。",
      href: "/invoices?status=overdue",
      title: "請款單已逾期",
      tone: "danger" as const,
    },
    pendingReceipts.length && {
      action: "確認收款",
      count: pendingReceipts.length,
      description: "由報價單建立的草稿收據；確認收到款項後才會列入收入。",
      href: "/receipts?status=pending",
      title: "收據等待確認收款",
      tone: "warning" as const,
    },
    partiallyPaidInvoices.length && {
      action: "登記剩餘收款",
      count: partiallyPaidInvoices.length,
      description: "已收到部分款項，還有餘額尚未收妥。",
      href: "/invoices?status=partially_paid",
      title: "請款單只收到部分款項",
      tone: "warning" as const,
    },
    expiringQuotes.length && {
      action: "查看即將到期",
      count: expiringQuotes.length,
      description: `${EXPIRY_WINDOW_DAYS} 天內到期，過期後就不能轉為請款單。`,
      href: "/quotes?status=sent",
      title: "報價單即將到期",
      tone: "warning" as const,
    },
    acceptedQuotes.length && {
      action: "轉為請款單",
      count: acceptedQuotes.length,
      description: "客戶已接受但還沒開請款單，可以直接一鍵轉出。",
      href: "/quotes?status=accepted",
      title: "已接受的報價單可以請款",
      tone: "success" as const,
    },
    draftInvoices.length && {
      action: "查看草稿",
      count: draftInvoices.length,
      description: "還沒發送給客戶的請款單草稿。",
      href: "/invoices?status=draft",
      title: "請款單仍是草稿",
      tone: "info" as const,
    },
    awaitingQuotes.length && {
      action: "查看報價單",
      count: awaitingQuotes.length,
      description: "已發送、等待客戶回覆接受或拒絕。",
      href: "/quotes?status=sent",
      title: "報價單等待客戶回覆",
      tone: "info" as const,
    },
    unpaidInvoices.length && {
      action: "查看請款單",
      count: unpaidInvoices.length,
      description: "已發送、還在付款期限內。",
      href: "/invoices?status=unpaid",
      title: "請款單等待付款",
      tone: "info" as const,
    },
  ].filter(Boolean) as Array<{
    action: string;
    count: number;
    description: string;
    href: string;
    title: string;
    tone: "danger" | "warning" | "success" | "info";
  }>;

  const activity: Activity[] = [
    ...receipts.map((receipt) => ({
      amount: receipt.amount,
      at: receipt.createdAt,
      href: `/receipts/${receipt.id}`,
      icon: <ReceiptText aria-hidden="true" size={15} />,
      kind: "收據",
      title: `${receipt.receiptNumber} · ${receipt.payerName}`,
    })),
    ...quotes.map((quote) => ({
      amount: quote.totalAmount,
      at: quote.createdAt ?? quote.issueDate,
      href: `/quotes/${quote.id}`,
      icon: <FileSignature aria-hidden="true" size={15} />,
      kind: "報價單",
      title: `${quote.quoteNumber} · ${quote.customerSnapshot.name}`,
    })),
    ...invoices.map((invoice) => ({
      amount: invoice.totalAmount,
      at: invoice.createdAt ?? invoice.issueDate,
      href: `/invoices/${invoice.id}`,
      icon: <FileText aria-hidden="true" size={15} />,
      kind: "請款單",
      title: `${invoice.invoiceNumber} · ${invoice.customerSnapshot.companyName || invoice.customerSnapshot.name}`,
    })),
    ...(ledger?.entries ?? [])
      .filter((entry) => entry.source === "manual")
      .map((entry) => ({
        amount: entry.amount,
        at: entry.createdAt,
        href: "/ledger",
        icon: <BookOpenText aria-hidden="true" size={15} />,
        kind: entry.type === "IN" ? "收入" : "支出",
        title: entry.description,
      })),
  ]
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, 8);

  const isNewWorkspace =
    !loading && !receipts.length && !quotes.length && !invoices.length && !(ledger?.entries.length ?? 0);

  // Driven by the session's feature switches, so a switched-off module never
  // offers a shortcut into a page that would refuse it.
  const quickActions = [
    features.receipts && canManageRecords
      ? { description: "填寫付款人與金額，儲存後輸出 PDF。", href: "/receipts/new", icon: ReceiptText, label: "開立收據" }
      : null,
    features.quotations && canManageRecords
      ? { description: "成交前給客戶的報價文件。", href: "/quotes/new", icon: FileSignature, label: "建立報價單" }
      : null,
    features.invoices && canManageRecords
      ? { description: "向客戶請款的付款通知。", href: "/invoices/new", icon: FileText, label: "建立請款單" }
      : null,
    features.accounting && canManageRecords
      ? { description: "補記沒有開收據的收入或支出。", href: "/ledger", icon: BookOpenText, label: "記一筆收支" }
      : null,
  ].filter(Boolean) as Array<{ description: string; href: string; icon: typeof ReceiptText; label: string }>;

  return (
    <div className="page">
      <PageHeader
        description={`${organization.name} 的今日概況。這裡集中列出需要你處理的事、最近的紀錄，以及最常用的操作。`}
        how={help.dashboard}
        title="總覽"
      />

      {failures.length ? (
        <Callout title="部分資料暫時無法載入" tone="warning">
          <p>
            {failures.map((failure) => failure.label).join("、")}
            的資料這次沒有載入成功，其他區塊仍然是最新的。
          </p>
          <p>{failures[0].message}</p>
          <FormActions>
            <Button onClick={() => setVersion((current) => current + 1)} size="sm" variant="secondary">
              重新載入
            </Button>
          </FormActions>
        </Callout>
      ) : null}

      {loading ? (
        <div className="card">
          <SkeletonRows label="正在載入總覽" rows={7} />
        </div>
      ) : (
        <>
          {ledger ? (
            <Stats>
              <Stat
                hint="包含已確認收款的收據與手動收入"
                label="累計收入"
                tone={ledger.summary.income ? "income" : undefined}
                value={currencyAmount(currency, ledger.summary.income)}
              />
              <Stat
                hint="所有手動記錄的支出"
                label="累計支出"
                tone={ledger.summary.expense ? "expense" : undefined}
                value={currencyAmount(currency, ledger.summary.expense)}
              />
              <Stat hint="收入減支出" label="目前餘額" value={currencyAmount(currency, ledger.summary.balance)} />
            </Stats>
          ) : null}

          <div className="dash-grid" style={{ marginTop: ledger ? 18 : 0 }}>
            <div className="dash-stack">
              <Card description="按照急迫程度排序，點進去就能直接處理。" title="待處理">
                {todos.length ? (
                  <ul className="todo-list">
                    {todos.map((todo) => (
                      <li className="todo-item" key={todo.title}>
                        <span className={`todo-count is-${todo.tone}`}>{todo.count}</span>
                        <span className="todo-text">
                          <strong>{todo.title}</strong>
                          <span>{todo.description}</span>
                        </span>
                        <ButtonLink href={todo.href} size="sm" variant="secondary">
                          {todo.action}
                        </ButtonLink>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState icon={Clock} title="目前沒有待處理事項">
                    <p>沒有逾期的請款單、等待確認的收款，也沒有等客戶回覆的報價單。</p>
                    <p>要開始新的工作，可以從右側的「快速開始」建立文件。</p>
                  </EmptyState>
                )}
              </Card>

              <Card description="你最近建立的文件與紀錄。" title="最近活動">
                {activity.length ? (
                  <ul className="activity-list">
                    {activity.map((entry) => (
                      <li className="activity-item" key={`${entry.kind}-${entry.title}-${entry.at}`}>
                        <span className="activity-icon">{entry.icon}</span>
                        <span className="activity-text">
                          <Link href={entry.href}>{entry.title}</Link>
                          <span>
                            {entry.kind} · {formatDate(entry.at)}
                          </span>
                        </span>
                        {entry.amount === undefined ? null : (
                          <span className="activity-amount">{currencyAmount(currency, entry.amount)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    actions={
                      canManageRecords ? (
                        <ButtonLink href="/receipts/new" icon={<Plus aria-hidden="true" size={16} />} variant="primary">
                          開立第一張收據
                        </ButtonLink>
                      ) : null
                    }
                    title="還沒有任何紀錄"
                  >
                    <p>你在 {organization.name} 建立的收據、報價單、請款單與收支紀錄都會出現在這裡。</p>
                    <p>
                      {canManageRecords
                        ? "第一次使用建議先確認「設定 → 公司資料」，再開立第一張收據。"
                        : "你的角色可以查看資料，建立文件請聯絡工作區的管理者。"}
                    </p>
                  </EmptyState>
                )}
              </Card>
            </div>

            <div className="dash-stack">
              {isNewWorkspace && canManageSettings ? (
                <Card description="三個步驟就能開出第一份正式文件。" title="開始使用 RE-Biz">
                  <ol className="getting-started">
                    <li>
                      <div>
                        <Link href="/settings/company">確認公司資料</Link>
                        <span>公司名稱、地址與收款銀行資料會印在每一份文件上。</span>
                      </div>
                    </li>
                    <li>
                      <div>
                        <Link href="/settings/receipt-template">挑一個收據樣式</Link>
                        <span>選版型與主色，右側會即時看到收據長什麼樣。</span>
                      </div>
                    </li>
                    <li>
                      <div>
                        <Link href="/receipts/new">開立第一張收據</Link>
                        <span>填付款人與金額，儲存後直接輸出 PDF。</span>
                      </div>
                    </li>
                  </ol>
                </Card>
              ) : null}

              {quickActions.length ? (
                <Card description="這裡的每一項都會直接開啟填寫畫面。" title="快速開始">
                  <div className="quick-actions">
                    {quickActions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <Link className="quick-action" href={action.href} key={action.href}>
                          <Icon aria-hidden="true" size={18} />
                          <span>
                            {action.label}
                            <em>{action.description}</em>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </Card>
              ) : null}

              <Card title="你的身分">
                <SummaryList
                  items={[
                    { label: "登入身分", value: user.name },
                    { label: "所屬公司", value: organization.name },
                    { label: "角色", value: roleLabel(role) },
                  ]}
                />
                <p className="field-hint">{roleDescriptions[role]}</p>
                <p className="field-hint" style={{ marginTop: 8 }}>
                  收據、報價單、請款單與記帳資料以建立者為單位隔離，你看到的是自己建立的紀錄。
                </p>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
