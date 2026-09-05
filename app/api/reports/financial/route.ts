import { ObjectId } from "mongodb";

import { getCurrentUser } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";
import { readPageParams, resolvePage } from "@/lib/query";
import { isIsoDate, ledgerUnionPipeline, periodMatchers } from "@/lib/reports/financial";

export const runtime = "nodejs";

type ReportRow = {
  _id: ObjectId;
  amount: number;
  createdAt: Date;
  date: string;
  description: string;
  source: "manual" | "receipt";
  type: "IN" | "OUT";
};

/** An absent bound means "no limit on this side", so `null` stays valid here. */
function isDate(value: string | null) {
  return value === null || isIsoDate(value);
}

/** A period report shares the ledger's recognition rules: confirmed receipts
 * are income; pending receipts are not recognised yet. */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!await canUseWorkspaceFeature(user, "accounting")) {
      return Response.json({ message: "此工作區目前無法使用記帳功能。" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const type = searchParams.get("type") ?? "all";
    if (!isDate(startDate) || !isDate(endDate) || (startDate && endDate && startDate > endDate)) {
      return Response.json({ message: "請輸入有效的報表期間。" }, { status: 400 });
    }
    if (type !== "all" && type !== "IN" && type !== "OUT") {
      return Response.json({ message: "收支類型篩選不正確。" }, { status: 400 });
    }

    const organizationId = new ObjectId(user.organization.id);
    const matchers = periodMatchers(organizationId, startDate, endDate);
    const database = await getDatabase();
    const [manualTotals, receiptTotals] = await Promise.all([
      database.collection("ledgerEntries").aggregate<{ _id: "IN" | "OUT"; amount: number; count: number }>([
        { $match: matchers.manual },
        { $group: { _id: "$type", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]).toArray(),
      database.collection("receipts").aggregate<{ amount: number; count: number }>([
        { $match: matchers.receipt },
        { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]).toArray(),
    ]);
    const manualIncome = manualTotals.find((row) => row._id === "IN")?.amount ?? 0;
    const expense = manualTotals.find((row) => row._id === "OUT")?.amount ?? 0;
    const manualCount = manualTotals.reduce((total, row) => total + row.count, 0);
    const receiptIncome = receiptTotals[0]?.amount ?? 0;
    const receiptCount = receiptTotals[0]?.count ?? 0;
    const income = manualIncome + receiptIncome;

    const detailPipeline = ledgerUnionPipeline(matchers, type);
    const { page: requestedPage, pageSize } = readPageParams(searchParams);
    const [counted] = await database.collection("ledgerEntries").aggregate<{ value: number }>([...detailPipeline, { $count: "value" }]).toArray();
    const { page, skip, total, totalPages } = resolvePage({ page: requestedPage, pageSize, total: counted?.value ?? 0 });
    const rows = total ? await database.collection("ledgerEntries").aggregate<ReportRow>([
      ...detailPipeline, { $sort: { date: -1, createdAt: -1, _id: -1 } }, { $skip: skip }, { $limit: pageSize },
    ]).toArray() : [];

    return Response.json({
      entries: rows.map((row) => ({ amount: row.amount, createdAt: row.createdAt.toISOString(), date: row.date, description: row.description, id: row.source === "receipt" ? `receipt:${row._id.toHexString()}` : row._id.toHexString(), source: row.source, type: row.type })),
      expense, income, manualIncome, netAmount: income - expense, page, receiptIncome, total, totalPages,
      transactionCount: manualCount + receiptCount,
    });
  } catch {
    return Response.json({ message: "無法產生財務報表。" }, { status: 503 });
  }
}
