import type { ReceiptDraft, SavedReceipt } from "@/types/records";

/**
 * Client-side helpers for the receipt builder. Extracted unchanged from the old
 * single-file app so the parsing and payment-method rules behave exactly as before.
 */

export const hiddenPaymentMethod = "__hidden__";
export const otherPaymentMethod = "__other__";

export const paymentMethodOptions = [
  "Bank transfer",
  "Cash",
  "Cheque",
  "Credit card",
  "FPS",
  "PayMe",
] as const;

export const batchColumns = "開立日期,付款人名稱,付款人地址,收款項目／說明,收款金額,付款方式,備註";

export function paymentMethodSelectValue(value: string) {
  if (value === hiddenPaymentMethod || value === "不顯示") return hiddenPaymentMethod;
  return paymentMethodOptions.includes(value as (typeof paymentMethodOptions)[number])
    ? value
    : otherPaymentMethod;
}

export function paymentMethodIsValid(value: string) {
  return value === hiddenPaymentMethod || value.trim().length > 0;
}

export function paymentMethodIsHidden(value: string) {
  return value === hiddenPaymentMethod || value === "不顯示";
}

export type IssuerDefaults = { address: string; businessRegistration: string; contact: string; name: string };

export function newReceiptDraft(issueDate: string, issuer?: IssuerDefaults): ReceiptDraft {
  return {
    amount: "",
    businessRegistration: issuer?.businessRegistration ?? "",
    description: "",
    issueDate,
    issuerAddress: issuer?.address ?? "",
    issuerContact: issuer?.contact ?? "",
    issuerName: issuer?.name ?? "",
    notes: "",
    payerAddress: "",
    payerName: "",
    paymentMethod: "Bank transfer",
    receiptNumber: "",
  };
}

export function draftFromSavedReceipt(receipt: SavedReceipt): ReceiptDraft {
  return {
    amount: String(receipt.amount),
    businessRegistration: receipt.businessRegistration,
    description: receipt.description,
    issueDate: receipt.issueDate,
    issuerAddress: receipt.issuerAddress,
    issuerContact: receipt.issuerContact,
    issuerName: receipt.issuerName,
    lineItems: receipt.lineItems,
    notes: receipt.notes,
    payerAddress: receipt.payerAddress,
    payerName: receipt.payerName,
    paymentMethod: receipt.paymentMethod,
    receiptNumber: receipt.receiptNumber,
    sourceQuoteNumber: receipt.sourceQuoteNumber,
  };
}

/** The API rejects unknown keys, so only the stored fields are sent. */
export function serializeReceipt(receipt: ReceiptDraft) {
  return {
    amount: receipt.amount,
    businessRegistration: receipt.businessRegistration,
    description: receipt.description,
    issueDate: receipt.issueDate,
    issuerAddress: receipt.issuerAddress,
    issuerContact: receipt.issuerContact,
    issuerName: receipt.issuerName,
    notes: receipt.notes,
    payerAddress: receipt.payerAddress,
    payerName: receipt.payerName,
    paymentMethod: receipt.paymentMethod,
  };
}

export function splitDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === delimiter && !inQuotes) {
      cells.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  cells.push(value.trim());
  return cells;
}

export function isHeaderRow(cells: string[]) {
  return cells.some((cell) => /收據編號|付款人|收款項目|amount|payer|description/i.test(cell));
}

export type BatchReceipt = ReceiptDraft & { sourceLine: number };

export function parseBatchReceipts(text: string, base: ReceiptDraft, fallbackDate: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), sourceLine: index + 1 }))
    .filter(({ line }) => line);
  if (!lines.length) return { error: "請先貼上或匯入至少一筆收據資料。", receipts: [] as BatchReceipt[] };

  const delimiter = lines[0].line.includes("\t") ? "\t" : ",";
  const rows = lines.map(({ line, sourceLine }) => ({ cells: splitDelimitedLine(line, delimiter), sourceLine }));
  const hasHeader = isHeaderRow(rows[0].cells);
  const hasLegacyReceiptNumberColumn = hasHeader && /收據編號/i.test(rows[0].cells[0] ?? "");
  const dataRows = hasHeader ? rows.slice(1) : rows;
  if (!dataRows.length)
    return { error: "只有標題列，下面沒有資料。請確認標題列底下有收據內容。", receipts: [] as BatchReceipt[] };

  const receipts: BatchReceipt[] = [];
  for (const { cells, sourceLine } of dataRows) {
    const values = hasLegacyReceiptNumberColumn || cells.length >= 8 ? cells.slice(1) : cells;
    const [issueDate, payerName, payerAddress, description, amount, paymentMethod, notes] = values;
    if (
      values.length < 5 ||
      !payerName ||
      !description ||
      !amount ||
      !Number.isFinite(Number(amount)) ||
      Number(amount) < 0
    ) {
      return {
        error: `第 ${sourceLine} 行的資料不完整：付款人名稱、收款項目與有效金額都必須填寫。`,
        receipts: [] as BatchReceipt[],
      };
    }

    receipts.push({
      ...base,
      amount,
      description,
      issueDate: issueDate || base.issueDate || fallbackDate,
      notes: notes || "",
      payerAddress: payerAddress || "",
      payerName,
      paymentMethod: paymentMethod || base.paymentMethod,
      receiptNumber: "",
      sourceLine,
    });
  }
  return { error: "", receipts };
}

export function batchRowCount(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return 0;
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  return isHeaderRow(splitDelimitedLine(lines[0], delimiter)) ? lines.length - 1 : lines.length;
}

export function batchTemplateCsv(sampleDate: string) {
  return [
    batchColumns,
    `${sampleDate},陳大文,香港九龍尖沙咀,活動報名費,1500,Bank transfer,Thank you for your payment.`,
    `${sampleDate},李小明,香港新界沙田,顧問服務費,2800,FPS,`,
    `${sampleDate},王小姐,香港島中環,場地租借,6000,不顯示,`,
    `${sampleDate},陳先生,香港九龍觀塘,設計訂金,3200,Stripe,`,
  ].join("\n");
}
