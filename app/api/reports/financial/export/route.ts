import { ObjectId } from "mongodb";

import { getCurrentUser } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";
import { categoriseExpense, isIsoDate, ledgerUnionPipeline, periodMatchers, previousPeriod } from "@/lib/reports/financial";
import { buildIncomeStatementWorkbook, type PeriodFigures, type StatementEntry } from "@/lib/reports/income-statement";

export const runtime = "nodejs";

/** A statement is built in memory, so a decade-wide range has to be refused rather than served slowly. */
const MAX_EXPORT_ROWS = 10_000;

type PeriodRow = {
  amount: number;
  date: string;
  description: string;
  source: "manual" | "receipt";
  type: "IN" | "OUT";
};

async function readPeriod(
  database: Awaited<ReturnType<typeof getDatabase>>,
  organizationId: ObjectId,
  startDate: string,
  endDate: string,
) {
  return database.collection("ledgerEntries").aggregate<PeriodRow>([
    ...ledgerUnionPipeline(periodMatchers(organizationId, startDate, endDate)),
    { $sort: { date: 1, createdAt: 1, _id: 1 } },
    { $limit: MAX_EXPORT_ROWS + 1 },
  ]).toArray();
}

function summarise(rows: PeriodRow[], label: string, range: string): PeriodFigures {
  const figures: PeriodFigures = { expenses: {}, label, manualIncome: 0, range, receiptIncome: 0 };
  for (const row of rows) {
    if (row.type === "OUT") {
      const category = categoriseExpense(row.description);
      figures.expenses[category] = (figures.expenses[category] ?? 0) + row.amount;
    } else if (row.source === "receipt") figures.receiptIncome += row.amount;
    else figures.manualIncome += row.amount;
  }
  return figures;
}

/** `2026.09.01 – 2026.09.30`, the dotted form the statement template uses. */
function formatRange(startDate: string, endDate: string) {
  return `${startDate.replaceAll("-", ".")} – ${endDate.replaceAll("-", ".")}`;
}

/**
 * The financial report as a 損益表 workbook. The recognition rules are shared
 * with the on-screen report, so the two always reconcile; the `type` filter of
 * the screen is deliberately not applied, because an income statement that
 * showed only one side would not add up.
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    // Two gates, because they answer different questions: whether this company
    // keeps books at all, and whether its plan lets it take the data out.
    const [canRead, canExport] = await Promise.all([
      canUseWorkspaceFeature(user, "accounting"),
      canUseWorkspaceFeature(user, "exports"),
    ]);
    if (!canRead) return Response.json({ message: "此工作區目前無法使用記帳功能。" }, { status: 403 });
    if (!canExport) return Response.json({ message: "此工作區目前無法使用匯出功能。" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) {
      return Response.json({ message: "請輸入有效的報表期間。" }, { status: 400 });
    }

    const organizationId = new ObjectId(user.organization.id);
    const previous = previousPeriod(startDate, endDate);
    const database = await getDatabase();
    const [current, comparison] = await Promise.all([
      readPeriod(database, organizationId, startDate, endDate),
      readPeriod(database, organizationId, previous.startDate, previous.endDate),
    ]);
    if (current.length > MAX_EXPORT_ROWS || comparison.length > MAX_EXPORT_ROWS) {
      return Response.json({ message: `報表期間超過 ${MAX_EXPORT_ROWS} 筆紀錄，請縮短期間後再匯出。` }, { status: 400 });
    }

    const entries: StatementEntry[] = current.map((row) => ({
      amount: row.amount,
      category: row.type === "OUT"
        ? categoriseExpense(row.description)
        : row.source === "receipt" ? "收據收入" : "手動收入",
      date: row.date,
      description: row.description,
      source: row.source,
      type: row.type,
    }));

    const workbook = await buildIncomeStatementWorkbook({
      currency: user.organization.currency,
      entries,
      organizationName: user.organization.name,
      periods: [
        summarise(current, "本期", formatRange(startDate, endDate)),
        summarise(comparison, "上一期", formatRange(previous.startDate, previous.endDate)),
      ],
    });

    const filename = `財務報表_${startDate}_${endDate}.xlsx`;
    return new Response(new Uint8Array(workbook), {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="financial-report-${startDate}-${endDate}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch {
    return Response.json({ message: "無法匯出財務報表。" }, { status: 503 });
  }
}
