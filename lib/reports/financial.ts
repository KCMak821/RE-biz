/**
 * Recognition rules shared by the financial report screen and its Excel export.
 * Both must agree on what counts as income in a period, or the exported
 * statement would not reconcile with the numbers the user was just looking at.
 */

import type { ObjectId } from "mongodb";

const DAY_MS = 86_400_000;

/** A real `YYYY-MM-DD` day — `2026-02-31` is rejected rather than rolled over. */
export function isIsoDate(value: string | null): value is string {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Manual entries are dated by `date`, receipts by `issueDate`; pending receipts are not recognised. */
export function periodMatchers(organizationId: ObjectId, startDate: string | null, endDate: string | null) {
  const range: Record<string, string> = {};
  if (startDate) range.$gte = startDate;
  if (endDate) range.$lte = endDate;
  const bounded = Object.keys(range).length > 0;
  return {
    manual: { organizationId, ...(bounded ? { date: range } : {}) } as Record<string, unknown>,
    receipt: {
      organizationId,
      paymentStatus: { $ne: "pending" },
      ...(bounded ? { issueDate: range } : {}),
    } as Record<string, unknown>,
  };
}

/**
 * Reads manual entries and recognised receipts as one list. `type` narrows the
 * manual side; receipts are income only, so `OUT` drops them entirely.
 */
export function ledgerUnionPipeline(
  matchers: ReturnType<typeof periodMatchers>,
  type: "all" | "IN" | "OUT" = "all",
) {
  const manualMatch = type === "all" ? matchers.manual : { ...matchers.manual, type };
  const pipeline: Record<string, unknown>[] = [
    { $match: manualMatch },
    { $project: { amount: 1, createdAt: 1, date: 1, description: 1, source: { $literal: "manual" }, type: 1 } },
  ];
  if (type !== "OUT") {
    pipeline.push({
      $unionWith: {
        coll: "receipts",
        pipeline: [
          { $match: matchers.receipt },
          {
            $project: {
              amount: 1, createdAt: 1, date: "$issueDate",
              description: { $concat: ["$receiptNumber", " · ", "$payerName"] },
              source: { $literal: "receipt" }, type: { $literal: "IN" },
            },
          },
        ],
      },
    });
  }
  return pipeline;
}

function isoDay(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * The equally long stretch of days immediately before the selected period, so
 * a 30-day report is compared against the previous 30 days rather than a
 * calendar month of a different length.
 */
export function previousPeriod(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  const days = Math.round((end - start) / DAY_MS) + 1;
  const previousEnd = start - DAY_MS;
  return { endDate: isoDay(previousEnd), startDate: isoDay(previousEnd - (days - 1) * DAY_MS) };
}

/**
 * The expense headings of the standard single-step income statement. Ledger
 * entries carry a free-text description and no account code, so each one is
 * matched against these keywords; the first heading that matches wins and
 * anything unrecognised falls to 其他支出. The chosen heading is repeated on the
 * detail sheet so a wrong guess is visible and can be corrected by hand.
 */
export const EXPENSE_CATEGORIES: { keywords: string[]; label: string }[] = [
  { keywords: ["廣告", "宣傳", "推廣", "行銷", "營銷", "advertis", "marketing"], label: "廣告" },
  { keywords: ["進貨", "運費", "貨運", "速遞", "快遞", "物流", "送貨", "freight", "shipping", "courier", "delivery"], label: "進貨運費" },
  { keywords: ["折舊", "攤銷", "depreciat", "amortis", "amortiz"], label: "折舊" },
  { keywords: ["保險", "insur"], label: "保險" },
  { keywords: ["利息", "interest"], label: "利息" },
  { keywords: ["郵資", "郵費", "郵寄", "postage"], label: "郵資" },
  { keywords: ["租金", "房租", "舖租", "鋪租", "租場", "租用", "租賃", "rent", "lease"], label: "租金" },
  { keywords: ["維修", "保養", "修理", "維護", "repair", "maintenance"], label: "維修保養" },
  { keywords: ["旅遊", "差旅", "出差", "機票", "酒店", "車費", "交通", "的士", "travel", "flight", "hotel", "taxi"], label: "旅遊" },
  { keywords: ["工資", "薪金", "薪水", "薪酬", "人工", "花紅", "強積金", "mpf", "salary", "wage", "payroll"], label: "工資" },
  { keywords: ["電話", "手機", "電訊", "寬頻", "上網", "網絡", "網路", "phone", "telecom", "internet", "broadband"], label: "電話費用" },
  { keywords: [], label: "其他支出" },
];

export const OTHER_EXPENSE_LABEL = "其他支出";

export function categoriseExpense(description: string) {
  const text = description.toLowerCase();
  return EXPENSE_CATEGORIES.find((category) => category.keywords.some((keyword) => text.includes(keyword)))?.label
    ?? OTHER_EXPENSE_LABEL;
}
