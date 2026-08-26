"use client";

import { Download, FileDown, RotateCcw, Rows3, FileText } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type ReceiptForm = {
  receiptNumber: string;
  issueDate: string;
  issuerName: string;
  issuerAddress: string;
  businessRegistration: string;
  issuerContact: string;
  payerName: string;
  payerAddress: string;
  description: string;
  amount: string;
  paymentMethod: string;
  notes: string;
};

type BatchReceipt = ReceiptForm & { sourceLine: number };
type Mode = "single" | "batch";

const today = new Date().toISOString().slice(0, 10);
const batchColumns = "收據編號,開立日期,付款人名稱,付款人地址,收款項目／說明,收款金額,付款方式,備註";

function newReceipt(): ReceiptForm {
  return {
    receiptNumber: "RC-" + today.replaceAll("-", "") + "-001",
    issueDate: today,
    issuerName: "",
    issuerAddress: "",
    businessRegistration: "",
    issuerContact: "",
    payerName: "",
    payerAddress: "",
    description: "",
    amount: "",
    paymentMethod: "Bank transfer",
    notes: "",
  };
}

function formatAmount(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || value === "") return "0.00";
  return new Intl.NumberFormat("en-HK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function splitDelimitedLine(line: string, delimiter: string) {
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

function isHeaderRow(cells: string[]) {
  return cells.some((cell) => /收據編號|付款人|收款項目|amount|payer|description/i.test(cell));
}

function parseBatchReceipts(text: string, base: ReceiptForm, startSequence: number) {
  const lines = text.split(/\r?\n/).map((line, index) => ({ line: line.trim(), sourceLine: index + 1 })).filter(({ line }) => line);
  if (!lines.length) return { receipts: [] as BatchReceipt[], error: "請先貼上至少一筆收據資料。" };

  const delimiter = lines[0].line.includes("\t") ? "\t" : ",";
  const rows = lines.map(({ line, sourceLine }) => ({ cells: splitDelimitedLine(line, delimiter), sourceLine }));
  const dataRows = isHeaderRow(rows[0].cells) ? rows.slice(1) : rows;
  if (!dataRows.length) return { receipts: [] as BatchReceipt[], error: "找不到可生成的收據資料，請確認標題列下方有內容。" };

  const receipts: BatchReceipt[] = [];
  for (let index = 0; index < dataRows.length; index += 1) {
    const { cells, sourceLine } = dataRows[index];
    const [receiptNumber, issueDate, payerName, payerAddress, description, amount, paymentMethod, notes] = cells;
    if (cells.length < 6 || !payerName || !description || !amount || !Number.isFinite(Number(amount)) || Number(amount) < 0) {
      return { receipts: [] as BatchReceipt[], error: `第 ${sourceLine} 行資料不完整：付款人、項目與有效金額為必填。` };
    }

    const date = issueDate || base.issueDate || today;
    const sequence = String(startSequence + index).padStart(3, "0");
    receipts.push({
      ...base,
      receiptNumber: receiptNumber || `RC-${date.replaceAll("-", "")}-${sequence}`,
      issueDate: date,
      payerName,
      payerAddress: payerAddress || "",
      description,
      amount,
      paymentMethod: paymentMethod || base.paymentMethod,
      notes: notes || "",
      sourceLine,
    });
  }
  return { receipts, error: "" };
}

function downloadBatchTemplate() {
  const csv = [
    batchColumns,
    ",2026-08-26,陳大文,香港九龍尖沙咀,活動報名費,1500,Bank transfer,Thank you for your payment.",
    ",2026-08-26,李小明,香港新界沙田,顧問服務費,2800,FPS,",
  ].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  link.download = "receipt-batch-template.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function Home() {
  const [form, setForm] = useState<ReceiptForm>(newReceipt);
  const [mode, setMode] = useState<Mode>("single");
  const [submitted, setSubmitted] = useState(false);
  const [batchText, setBatchText] = useState("");
  const [batchStartSequence, setBatchStartSequence] = useState("1");
  const [batchReceipts, setBatchReceipts] = useState<BatchReceipt[]>([]);
  const [batchError, setBatchError] = useState("");
  const formattedAmount = useMemo(() => formatAmount(form.amount), [form.amount]);

  function update(field: keyof ReceiptForm, value: string) {
    setSubmitted(false);
    setBatchError("");
    setForm((current) => ({ ...current, [field]: value }));
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setSubmitted(false);
    setBatchError("");
  }

  function printReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    const required = [form.receiptNumber, form.issuerName, form.payerName, form.description, form.amount];
    if (required.some((value) => !value.trim())) return;
    setBatchReceipts([]);
    window.setTimeout(() => window.print(), 40);
  }

  function generateBatch() {
    if (!form.issuerName.trim()) {
      setBatchError("請先填妥收款方名稱，這項資料會套用到每一張收據。");
      return;
    }
    const sequence = Number(batchStartSequence);
    if (!Number.isInteger(sequence) || sequence < 1) {
      setBatchError("起始流水號請填寫 1 以上的整數。");
      return;
    }
    const result = parseBatchReceipts(batchText, form, sequence);
    setBatchError(result.error);
    setBatchReceipts(result.receipts);
    if (!result.error) window.setTimeout(() => window.print(), 40);
  }

  function resetReceipt() {
    setForm(newReceipt());
    setSubmitted(false);
    setBatchText("");
    setBatchReceipts([]);
    setBatchError("");
    setBatchStartSequence("1");
  }

  const hasMissingRequired = [form.receiptNumber, form.issuerName, form.payerName, form.description, form.amount]
    .some((value) => !value.trim());

  return (
    <main className={`app-shell ${batchReceipts.length ? "printing-batch" : ""}`}>
      <header className="topbar no-print">
        <div className="brand-lockup">
          <div className="brand-mark">R</div>
          <div>
            <p className="eyebrow">HONG KONG · RECEIPT MAKER</p>
            <h1>簡易收據系統</h1>
          </div>
        </div>
        <p className="topbar-note">普通收據 · PDF ready</p>
      </header>

      <section className="workspace">
        <section className="editor-panel no-print" aria-labelledby="editor-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">CREATE A RECEIPT</p>
              <h2 id="editor-title">{mode === "single" ? "填寫收據資料" : "批量生成收據"}</h2>
            </div>
            <button className="reset-button" type="button" onClick={resetReceipt}>
              <RotateCcw size={15} aria-hidden="true" />
              清除重填
            </button>
          </div>

          <div className="mode-switch" role="tablist" aria-label="收據生成方式">
            <button className={mode === "single" ? "active" : ""} type="button" role="tab" aria-selected={mode === "single"} onClick={() => switchMode("single")}>
              <FileText size={15} aria-hidden="true" /> 單張收據
            </button>
            <button className={mode === "batch" ? "active" : ""} type="button" role="tab" aria-selected={mode === "batch"} onClick={() => switchMode("batch")}>
              <Rows3 size={15} aria-hidden="true" /> 批量生成
            </button>
          </div>

          {mode === "single" ? (
            <form onSubmit={printReceipt}>
              <fieldset className="form-section">
                <legend>收據資料</legend>
                <div className="field-grid compact-grid">
                  <Field label="收據編號" required value={form.receiptNumber} onChange={(value) => update("receiptNumber", value)} invalid={submitted && !form.receiptNumber.trim()} />
                  <Field label="開立日期" required type="date" value={form.issueDate} onChange={(value) => update("issueDate", value)} />
                </div>
              </fieldset>

              <IssuerFields form={form} update={update} required={submitted} />

              <fieldset className="form-section">
                <legend>付款資料</legend>
                <div className="field-grid">
                  <Field label="付款人名稱" required value={form.payerName} placeholder="例如：Chan Tai Man" onChange={(value) => update("payerName", value)} invalid={submitted && !form.payerName.trim()} />
                  <Field label="付款方式" value={form.paymentMethod} onChange={(value) => update("paymentMethod", value)} />
                  <Field className="full-span" label="付款人地址（選填）" value={form.payerAddress} placeholder="香港⋯" onChange={(value) => update("payerAddress", value)} />
                  <Field className="full-span" label="收款項目／說明" required value={form.description} placeholder="例如：活動報名費" onChange={(value) => update("description", value)} invalid={submitted && !form.description.trim()} />
                  <Field label="收款金額（HKD）" required type="number" min="0" step="0.01" value={form.amount} placeholder="0.00" onChange={(value) => update("amount", value)} invalid={submitted && !form.amount.trim()} />
                  <label className="field">
                    <span>收據預覽金額</span>
                    <output className="read-only-value">HKD {formattedAmount}</output>
                  </label>
                  <Field className="full-span" label="備註（選填）" value={form.notes} placeholder="例如：Thank you for your payment." onChange={(value) => update("notes", value)} />
                </div>
              </fieldset>

              {submitted && hasMissingRequired && <p className="validation-message" role="alert">請先填妥所有標示 * 的欄位。</p>}
              <button className="primary-action" type="submit"><FileDown size={18} aria-hidden="true" />生成 PDF／列印收據</button>
              <p className="form-hint">按下後會開啟列印視窗，選擇「另存為 PDF」即可下載正式收據。</p>
            </form>
          ) : (
            <section className="batch-builder" aria-label="批量生成收據">
              <fieldset className="form-section">
                <legend>共用的收款方資料</legend>
                <p className="batch-intro">以下資料會套用到每一張收據；只需設定一次。</p>
                <div className="field-grid">
                  <Field label="商號／收款人名稱" required value={form.issuerName} placeholder="例如：ABC Company Limited" onChange={(value) => update("issuerName", value)} invalid={!!batchError && !form.issuerName.trim()} />
                  <Field label="商業登記號碼（選填）" value={form.businessRegistration} placeholder="例如：12345678" onChange={(value) => update("businessRegistration", value)} />
                  <Field className="full-span" label="地址（選填）" value={form.issuerAddress} placeholder="香港九龍⋯" onChange={(value) => update("issuerAddress", value)} />
                  <Field className="full-span" label="電話／電郵（選填）" value={form.issuerContact} placeholder="+852 1234 5678 · hello@example.com" onChange={(value) => update("issuerContact", value)} />
                </div>
              </fieldset>

              <fieldset className="form-section batch-data-section">
                <div className="batch-section-heading">
                  <legend>貼上批量資料</legend>
                  <button className="template-button" type="button" onClick={downloadBatchTemplate}><Download size={14} aria-hidden="true" />下載格式範例</button>
                </div>
                <p className="batch-intro">支援直接從 Excel 或 Google Sheets 複製貼上，可包含標題列。欄位順序：收據編號、開立日期、付款人名稱、付款人地址、收款項目、收款金額、付款方式、備註。收據編號及日期可留空。</p>
                <label className="batch-textarea-label">
                  <span>每行一張收據</span>
                  <textarea value={batchText} onChange={(event) => { setBatchText(event.target.value); setBatchError(""); }} placeholder={`${batchColumns}\n,${today},陳大文,香港九龍尖沙咀,活動報名費,1500,Bank transfer,Thank you for your payment.`} />
                </label>
                <div className="batch-options">
                  <Field label="自動編號的起始流水號" type="number" min="1" step="1" value={batchStartSequence} onChange={setBatchStartSequence} />
                  <p>未填收據編號時，系統會以 RC-日期-流水號 自動編號。</p>
                </div>
              </fieldset>

              {batchError && <p className="validation-message" role="alert">{batchError}</p>}
              <button className="primary-action" type="button" onClick={generateBatch}><Rows3 size={18} aria-hidden="true" />批量生成並列印 PDF</button>
              <p className="form-hint">會將每張收據分頁列印；在列印視窗選擇「另存為 PDF」即可得到一份多頁檔案。</p>
            </section>
          )}
        </section>

        <section className="preview-column" aria-labelledby="preview-title">
          <div className="preview-heading no-print">
            <div>
              <p className="eyebrow">LIVE PREVIEW</p>
              <h2 id="preview-title">{mode === "single" ? "收據預覽" : "批量作業說明"}</h2>
            </div>
            <span className="status-pill"><span /> {mode === "single" ? "尚未儲存" : "批量模式"}</span>
          </div>

          {mode === "single" ? <ReceiptPaper receipt={form} /> : <BatchPreview text={batchText} />}
          <p className="legal-note no-print">此工具提供一般普通收據版面，不包含香港電子發票、報稅或商業登記申報服務。</p>
        </section>
      </section>

      <section className="batch-print" aria-label="批量收據列印內容">
        {batchReceipts.map((receipt) => <ReceiptPaper key={`${receipt.receiptNumber}-${receipt.sourceLine}`} receipt={receipt} />)}
      </section>

      <footer className="no-print">
        <span>RECEIPT MAKER · HONG KONG</span>
        <span className="footer-separator">•</span>
        <span>先把收據開對，再談自動化。</span>
      </footer>
    </main>
  );
}

function IssuerFields({ form, update, required }: { form: ReceiptForm; update: (field: keyof ReceiptForm, value: string) => void; required: boolean }) {
  return <fieldset className="form-section">
    <legend>收款方資料</legend>
    <div className="field-grid">
      <Field label="商號／收款人名稱" required value={form.issuerName} placeholder="例如：ABC Company Limited" onChange={(value) => update("issuerName", value)} invalid={required && !form.issuerName.trim()} />
      <Field label="商業登記號碼（選填）" value={form.businessRegistration} placeholder="例如：12345678" onChange={(value) => update("businessRegistration", value)} />
      <Field className="full-span" label="地址（選填）" value={form.issuerAddress} placeholder="香港九龍⋯" onChange={(value) => update("issuerAddress", value)} />
      <Field className="full-span" label="電話／電郵（選填）" value={form.issuerContact} placeholder="+852 1234 5678 · hello@example.com" onChange={(value) => update("issuerContact", value)} />
    </div>
  </fieldset>;
}

function BatchPreview({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const rowCount = lines.length && isHeaderRow(splitDelimitedLine(lines[0], lines[0].includes("\t") ? "\t" : ",")) ? lines.length - 1 : lines.length;
  return <article className="batch-preview-card">
    <div className="batch-preview-icon"><Rows3 size={27} aria-hidden="true" /></div>
    <p className="eyebrow">BATCH RECEIPTS</p>
    <h3>一次完成多筆收據</h3>
    <p>把資料表貼進左側欄位，系統會套用共同的收款方資料、補齊空白編號，並為每張收據自動分頁。</p>
    <div className="batch-preview-stat"><strong>{rowCount || "—"}</strong><span>筆待生成資料</span></div>
    <ol>
      <li>填寫共用的收款方資料</li>
      <li>貼上每行一筆的收據資料</li>
      <li>列印後選擇「另存為 PDF」</li>
    </ol>
  </article>;
}

function ReceiptPaper({ receipt }: { receipt: ReceiptForm }) {
  const formattedAmount = formatAmount(receipt.amount);
  return <article className="receipt-paper" aria-label="Receipt preview">
    <div className="receipt-topline" />
    <div className="receipt-header">
      <div className="issuer-block">
        <p className="issuer-name">{receipt.issuerName || "YOUR BUSINESS NAME"}</p>
        <p>{receipt.issuerAddress || "Business address"}</p>
        {receipt.businessRegistration && <p>BR No. {receipt.businessRegistration}</p>}
        {receipt.issuerContact && <p>{receipt.issuerContact}</p>}
      </div>
      <div className="receipt-title-block"><p className="receipt-title">RECEIPT</p><p className="receipt-title-cn">收據</p></div>
    </div>
    <div className="receipt-meta"><div><span>Receipt No.</span><strong>{receipt.receiptNumber || "—"}</strong></div><div><span>Date</span><strong>{receipt.issueDate || "—"}</strong></div></div>
    <div className="bill-to"><span>Received from 收到款項自</span><strong>{receipt.payerName || "—"}</strong>{receipt.payerAddress && <p>{receipt.payerAddress}</p>}</div>
    <div className="receipt-table"><div className="table-header"><span>Particulars 項目</span><span>Amount (HKD)</span></div><div className="table-row"><span>{receipt.description || "—"}</span><strong>${formattedAmount}</strong></div><div className="table-total"><span>Total 收款總額</span><strong>HKD ${formattedAmount}</strong></div></div>
    <div className="amount-words"><span>Amount payable</span><strong>Hong Kong Dollars {formattedAmount}</strong></div>
    <div className="receipt-bottom"><div className="payment-details"><span>Payment method</span><strong>{receipt.paymentMethod || "—"}</strong>{receipt.notes && <p>{receipt.notes}</p>}</div><div className="signature-block"><div className="signature-line" /><span>Authorized signature</span></div></div>
    <p className="receipt-disclaimer">This receipt acknowledges payment received and is not a tax invoice.</p>
  </article>;
}

function Field({
  label, value, onChange, required, className = "", type = "text", placeholder, min, step, invalid,
}: {
  label: string; value: string; onChange: (value: string) => void; required?: boolean; className?: string; type?: string; placeholder?: string; min?: string; step?: string; invalid?: boolean;
}) {
  return <label className={"field " + className}>
    <span>{label}{required && <b aria-hidden="true"> *</b>}</span>
    <input aria-invalid={invalid || undefined} type={type} min={min} step={step} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  </label>;
}
