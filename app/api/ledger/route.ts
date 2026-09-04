import { ObjectId } from "mongodb";

import { canManageRecords, getCurrentUser } from "@/lib/auth";
import { canUseWorkspaceFeature } from "@/lib/platform-admin";
import { ledgerEntrySchema, type LedgerEntryInput } from "@/lib/ledger";
import { getDatabase } from "@/lib/mongodb";
import { keywordRegex, readKeyword, readPageParams, resolvePage } from "@/lib/query";

export const runtime = "nodejs";

type LedgerEntryDocument = LedgerEntryInput & {
  createdAt: Date;
  createdBy: ObjectId;
  organizationId: ObjectId;
};

type LedgerRow = {
  _id: ObjectId;
  amount: number;
  createdAt: Date;
  date: string;
  description: string;
  source: "manual" | "receipt";
  type: "IN" | "OUT";
};

const ledgerTypes = ["all", "IN", "OUT"] as const;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string) {
  return datePattern.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

/** Reads an optional inclusive date range shared by the ledger and reports. */
function readDateRange(searchParams: URLSearchParams) {
  const from = searchParams.get("from")?.trim() ?? "";
  const to = searchParams.get("to")?.trim() ?? "";
  if ((from && !isCalendarDate(from)) || (to && !isCalendarDate(to))) return null;
  if (from && to && from > to) return null;
  return { from, to };
}

function dateMatch(field: string, range: { from: string; to: string }) {
  if (!range.from && !range.to) return {};
  return {
    [field]: {
      ...(range.from ? { $gte: range.from } : {}),
      ...(range.to ? { $lte: range.to } : {}),
    },
  };
}

async function ledgerCollection() {
  const collection = (await getDatabase()).collection<LedgerEntryDocument>("ledgerEntries");
  await collection.createIndex({ organizationId: 1, date: -1, createdAt: -1 });
  return collection;
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!await canUseWorkspaceFeature(user, "accounting")) return Response.json({ message: "此工作區目前無法使用記帳功能。" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") ?? "all";
    if (!(ledgerTypes as readonly string[]).includes(type)) {
      return Response.json({ message: "收支類型篩選不正確。" }, { status: 400 });
    }
    const keyword = readKeyword(searchParams);
    const { page: requestedPage, pageSize } = readPageParams(searchParams);
    const range = readDateRange(searchParams);
    if (!range) return Response.json({ message: "日期區間不正確。" }, { status: 400 });

    const organizationId = new ObjectId(user.organization.id);
    const database = await getDatabase();
    const collection = await ledgerCollection();

    /* ---------------------------------------------------------------- summary
       The totals always cover every record, never just the current page. */
    const [totals, receiptTotal] = await Promise.all([
      collection.aggregate<{ _id: "IN" | "OUT"; total: number }>([
        { $match: { organizationId, ...dateMatch("date", range) } },
        { $group: { _id: "$type", total: { $sum: "$amount" } } },
      ]).toArray(),
      database.collection("receipts").aggregate<{ total: number }>([
        // Older ordinary receipts had no paymentStatus and remain paid for
        // backwards compatibility. Quote-created drafts are explicitly
        // pending, so they never become income until confirmation.
        { $match: { organizationId, paymentStatus: { $ne: "pending" }, ...dateMatch("issueDate", range) } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]).toArray(),
    ]);
    const manualIncome = totals.find((total) => total._id === "IN")?.total ?? 0;
    const expense = totals.find((total) => total._id === "OUT")?.total ?? 0;
    const income = manualIncome + (receiptTotal[0]?.total ?? 0);

    /* ------------------------------------------------------------------- list
       Manual entries and receipt-backed income live in two collections, so the
       page is cut across a union of both rather than in application memory. */
    // Income, expense and balance are the whole company's, so every member of
    // an organization reads identical totals.
    const manualMatch: Record<string, unknown> = { organizationId, ...dateMatch("date", range) };
    if (type !== "all") manualMatch.type = type;
    if (keyword) manualMatch.description = keywordRegex(keyword);

    const receiptMatch: Record<string, unknown> = {
      organizationId,
      paymentStatus: { $ne: "pending" },
      ...dateMatch("issueDate", range),
    };
    if (keyword) {
      const expression = keywordRegex(keyword);
      receiptMatch.$or = [{ receiptNumber: expression }, { payerName: expression }];
    }
    // Receipt-backed rows are always income, so an expense-only filter skips them.
    const includeReceipts = type !== "OUT";

    const listPipeline: Record<string, unknown>[] = [
      { $match: manualMatch },
      { $project: { amount: 1, createdAt: 1, date: 1, description: 1, source: { $literal: "manual" }, type: 1 } },
    ];
    if (includeReceipts) {
      listPipeline.push({
        $unionWith: {
          coll: "receipts",
          pipeline: [
            { $match: receiptMatch },
            {
              $project: {
                amount: 1,
                createdAt: 1,
                date: "$issueDate",
                description: { $concat: ["$receiptNumber", " · ", "$payerName"] },
                source: { $literal: "receipt" },
                type: { $literal: "IN" },
              },
            },
          ],
        },
      });
    }

    // Counted first so the requested page can be clamped, then only that page is
    // read back — neither query loads the whole ledger.
    const [counted] = await collection
      .aggregate<{ value: number }>([...listPipeline, { $count: "value" }])
      .toArray();
    const listTotal = counted?.value ?? 0;
    const { page, skip, totalPages } = resolvePage({ page: requestedPage, pageSize, total: listTotal });

    const rows = listTotal
      ? await collection
          .aggregate<LedgerRow>([
            ...listPipeline,
            { $sort: { date: -1, createdAt: -1, _id: -1 } },
            { $skip: skip },
            { $limit: pageSize },
          ])
          .toArray()
      : [];

    const entries = rows.map((row) => ({
      amount: row.amount,
      createdAt: row.createdAt.toISOString(),
      date: row.date,
      description: row.description,
      id: row.source === "receipt" ? `receipt:${row._id.toHexString()}` : row._id.toHexString(),
      source: row.source,
      type: row.type,
    }));

    return Response.json({
      entries,
      page,
      pageSize,
      summary: { balance: income - expense, expense, income },
      total: listTotal,
      totalPages,
    });
  } catch {
    return Response.json({ message: "無法讀取記帳資料。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const parsed = ledgerEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "請填妥類型、日期、說明與有效金額。" }, { status: 400 });

  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "請先登入。" }, { status: 401 });
    if (!canManageRecords(user)) return Response.json({ message: "你的角色只有檢視權限，無法新增記帳資料。" }, { status: 403 });
    if (!await canUseWorkspaceFeature(user, "accounting")) return Response.json({ message: "此工作區目前無法使用記帳功能。" }, { status: 403 });

    const entry: LedgerEntryDocument = {
      ...parsed.data,
      createdAt: new Date(),
      createdBy: new ObjectId(user.id),
      organizationId: new ObjectId(user.organization.id),
    };
    const result = await (await ledgerCollection()).insertOne(entry);
    return Response.json({ id: result.insertedId.toHexString() }, { status: 201 });
  } catch {
    return Response.json({ message: "無法儲存記帳資料。" }, { status: 503 });
  }
}
