/**
 * Builds the Excel workbook for the financial report. The layout follows the
 * standard single-step income statement (損益表) the user works from: a navy
 * banner, an income block, an expense block against fixed headings, and a
 * double-ruled 淨利 (虧損) line, with a comparison column for the preceding
 * period of the same length.
 */

import ExcelJS from "exceljs";

import { EXPENSE_CATEGORIES } from "@/lib/reports/financial";

const NAVY = "FF2E4369";
const DEEP_NAVY = "FF132E57";
const ROW_TINT = "FFF2F5F7";
const WHITE = "FFFFFFFF";
const FONT = "Microsoft JhengHei";

export type PeriodFigures = {
  /** Expense total per 損益表 heading; a heading with nothing in it prints a dash. */
  expenses: Record<string, number>;
  /** Column heading, e.g. 本期. */
  label: string;
  manualIncome: number;
  /** Human-readable date range shown under the heading. */
  range: string;
  receiptIncome: number;
};

export type StatementEntry = {
  amount: number;
  category: string;
  date: string;
  description: string;
  source: "manual" | "receipt";
  type: "IN" | "OUT";
};

export type IncomeStatementInput = {
  currency: string;
  entries: StatementEntry[];
  organizationName: string;
  /** Current period first, comparison period second. */
  periods: [PeriodFigures, PeriodFigures];
};

const INCOME_ROWS: { label: string; pick: (figures: PeriodFigures) => number }[] = [
  { label: "收據收入（已確認收款）", pick: (figures) => figures.receiptIncome },
  { label: "手動收入", pick: (figures) => figures.manualIncome },
];

/** `HKD 1,234.50`. The workspace currency replaces the template's hard-coded `$`. */
function amountFormat(currency: string) {
  const code = currency.replace(/[^A-Za-z]/g, "").toUpperCase() || "HKD";
  return `"${code}" #,##0.00`;
}

function fill(argb: string): ExcelJS.Fill {
  return { fgColor: { argb }, pattern: "solid", type: "pattern" };
}

function ruled(top: string, bottom: string, bottomStyle: "thin" | "double" = "thin"): Partial<ExcelJS.Borders> {
  return {
    bottom: { color: { argb: bottom }, style: bottomStyle },
    top: { color: { argb: top }, style: top === WHITE ? "medium" : "thin" },
  };
}

export async function buildIncomeStatementWorkbook(input: IncomeStatementInput) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RE-Biz";
  workbook.created = new Date();

  const money = amountFormat(input.currency);
  const sheet = workbook.addWorksheet("損益表", { views: [{ showGridLines: false }] });
  sheet.columns = [{ width: 17.7 }, { width: 36.2 }, { width: 20.2 }, { width: 20.7 }];

  /** Paints A..D so the banner and the paper-white margin run edge to edge. */
  function band(row: number, argb: string) {
    for (const column of [1, 2, 3, 4]) sheet.getCell(row, column).fill = fill(argb);
  }

  function setAmount(row: number, column: number, value: number | string) {
    const cell = sheet.getCell(row, column);
    cell.value = value;
    cell.numFmt = money;
    cell.alignment = { horizontal: "right", vertical: "middle" };
    return cell;
  }

  // Masthead — organisation, period, title.
  sheet.getRow(1).height = 39.75;
  band(1, WHITE);
  sheet.getRow(2).height = 44.25;
  band(2, WHITE);
  const name = sheet.getCell("B2");
  name.value = input.organizationName;
  name.font = { bold: true, color: { argb: NAVY }, name: FONT, size: 18 };
  name.alignment = { vertical: "middle" };

  sheet.getRow(3).height = 35.25;
  band(3, WHITE);
  const period = sheet.getCell("B3");
  period.value = `期間：${input.periods[0].range}`;
  period.font = { color: { argb: NAVY }, name: FONT, size: 10 };
  period.alignment = { vertical: "top" };

  sheet.getRow(4).height = 24.75;
  band(4, NAVY);
  const title = sheet.getCell("B4");
  title.value = "損益表";
  title.font = { bold: true, color: { argb: WHITE }, name: FONT, size: 12 };
  title.alignment = { horizontal: "left", vertical: "middle" };

  sheet.getRow(5).height = 30.75;
  band(5, NAVY);
  input.periods.forEach((figures, index) => {
    const cell = sheet.getCell(5, 3 + index);
    cell.value = `${figures.label}\n${figures.range}`;
    cell.font = { bold: true, color: { argb: WHITE }, name: FONT, size: 10 };
    cell.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
  });

  /** A section heading (收入 / 支出), its item rows, and the ruled total beneath them. */
  function block(options: {
    heading: string;
    headingHeight: number;
    rows: { label: string; values: number[] }[];
    totalLabel: string;
  }) {
    const headingRow = sheet.rowCount + 1;
    sheet.getRow(headingRow).height = options.headingHeight;
    const heading = sheet.getCell(headingRow, 2);
    heading.value = options.heading;
    heading.font = { bold: true, color: { argb: DEEP_NAVY }, name: FONT, size: 11 };
    heading.alignment = { vertical: "middle" };

    const firstItem = headingRow + 1;
    options.rows.forEach((row, index) => {
      const rowNumber = firstItem + index;
      const last = index === options.rows.length - 1;
      sheet.getRow(rowNumber).height = 15.75;
      for (const column of [1, 2, 3, 4]) {
        const cell = sheet.getCell(rowNumber, column);
        cell.fill = fill(ROW_TINT);
        cell.border = last
          ? ruled(WHITE, NAVY)
          : { bottom: { color: { argb: WHITE }, style: "medium" }, top: { color: { argb: WHITE }, style: "medium" } };
      }
      const label = sheet.getCell(rowNumber, 2);
      label.value = row.label;
      label.font = { color: { argb: DEEP_NAVY }, name: FONT, size: 10 };
      label.alignment = { vertical: "middle" };
      row.values.forEach((value, offset) => {
        const cell = setAmount(rowNumber, 3 + offset, value === 0 ? "-" : value);
        cell.font = { color: { argb: DEEP_NAVY }, name: FONT, size: 10 };
      });
    });

    const lastItem = firstItem + options.rows.length - 1;
    const totalRow = lastItem + 1;
    sheet.getRow(totalRow).height = 27;
    const label = sheet.getCell(totalRow, 2);
    label.value = options.totalLabel;
    label.font = { bold: true, color: { argb: DEEP_NAVY }, name: FONT, size: 10 };
    label.alignment = { vertical: "middle" };
    label.border = ruled(DEEP_NAVY, DEEP_NAVY, "double");
    ["C", "D"].forEach((letter, offset) => {
      const cell = setAmount(totalRow, 3 + offset, 0);
      cell.value = { formula: `SUM(${letter}${firstItem}:${letter}${lastItem})`, date1904: false };
      cell.font = { bold: true, color: { argb: NAVY }, name: FONT, size: 10 };
      cell.border = ruled(DEEP_NAVY, DEEP_NAVY, "double");
    });
    return { totalRow };
  }

  const income = block({
    heading: "收入",
    headingHeight: 30.75,
    rows: INCOME_ROWS.map((row) => ({ label: row.label, values: input.periods.map(row.pick) })),
    totalLabel: "總收入及收益",
  });

  sheet.getRow(sheet.rowCount + 1).height = 3;

  const expense = block({
    heading: "支出",
    headingHeight: 24.75,
    rows: EXPENSE_CATEGORIES.map((category) => ({
      label: category.label,
      values: input.periods.map((figures) => figures.expenses[category.label] ?? 0),
    })),
    totalLabel: "總支出",
  });

  const netRow = expense.totalRow + 1;
  sheet.getRow(netRow).height = 24.75;
  const netLabel = sheet.getCell(netRow, 2);
  netLabel.value = "    淨利 (虧損)";
  netLabel.font = { bold: true, color: { argb: DEEP_NAVY }, name: FONT, size: 10 };
  netLabel.alignment = { vertical: "middle" };
  netLabel.border = ruled(DEEP_NAVY, DEEP_NAVY, "double");
  ["C", "D"].forEach((letter, offset) => {
    const cell = setAmount(netRow, 3 + offset, 0);
    cell.value = { formula: `${letter}${income.totalRow}-${letter}${expense.totalRow}`, date1904: false };
    cell.font = { bold: true, color: { argb: DEEP_NAVY }, name: FONT, size: 10 };
    cell.border = ruled(DEEP_NAVY, DEEP_NAVY, "double");
  });

  addDetailSheet(workbook, input, money);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Every recognised entry of the selected period, unpaginated, so the statement
 * above can be traced line by line. Expenses carry a negative amount, which
 * makes the 金額 column add up to the net figure. 科目 repeats the heading the
 * description was matched to, so a wrong guess is visible and can be corrected.
 */
function addDetailSheet(workbook: ExcelJS.Workbook, input: IncomeStatementInput, money: string) {
  const sheet = workbook.addWorksheet("交易明細", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "發生日期", key: "date", width: 14 },
    { header: "收支", key: "type", width: 10 },
    { header: "項目／說明", key: "description", width: 46 },
    { header: "來源", key: "source", width: 14 },
    { header: "科目", key: "category", width: 18 },
    { header: "金額", key: "amount", width: 18 },
  ];

  const header = sheet.getRow(1);
  header.height = 24;
  header.font = { bold: true, color: { argb: WHITE }, name: FONT, size: 10 };
  header.alignment = { vertical: "middle" };
  header.eachCell((cell) => { cell.fill = fill(NAVY); });

  for (const entry of input.entries) {
    const row = sheet.addRow({
      amount: entry.type === "IN" ? entry.amount : -entry.amount,
      category: entry.category,
      date: entry.date,
      description: entry.description,
      source: entry.source === "receipt" ? "收據" : "手動記帳",
      type: entry.type === "IN" ? "收入" : "支出",
    });
    row.font = { color: { argb: DEEP_NAVY }, name: FONT, size: 10 };
    const amount = row.getCell("amount");
    amount.numFmt = money;
    amount.alignment = { horizontal: "right" };
  }

  sheet.autoFilter = { from: { column: 1, row: 1 }, to: { column: 6, row: 1 } };

  const lastEntryRow = sheet.rowCount;
  const totalRow = sheet.addRow({ description: "合計（收入減支出）" });
  totalRow.font = { bold: true, color: { argb: DEEP_NAVY }, name: FONT, size: 10 };
  const total = totalRow.getCell("amount");
  total.numFmt = money;
  total.alignment = { horizontal: "right" };
  total.value = input.entries.length ? { formula: `SUM(F2:F${lastEntryRow})`, date1904: false } : 0;
  totalRow.eachCell((cell) => { cell.border = { top: { color: { argb: DEEP_NAVY }, style: "thin" } }; });
}
