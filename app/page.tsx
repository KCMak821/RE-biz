"use client";

/* Authenticated, organization-scoped images cannot pass through Next's image optimizer. */
/* eslint-disable @next/next/no-img-element */

import { ArrowDownRight, ArrowUpRight, BookOpenText, Download, FileDown, FileUp, LayoutDashboard, Palette, Plus, ReceiptText, RotateCcw, Rows3, FileText, FileSignature } from "lucide-react";
import { KeyRound, LogIn, LogOut, UserPlus, UsersRound } from "lucide-react";
import Image from "next/image";
import { type ChangeEvent, type CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";

import { defaultReceiptTemplate, receiptTemplatePresets, type ReceiptTemplate } from "@/lib/receipt-template";
import { QuotationWorkspace } from "@/components/quotation-workspace";

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
  lineItems?: ReceiptLineItem[];
  sourceQuoteNumber?: string;
};

type ReceiptLineItem = {
  description: string;
  discountAmount: number;
  name: string;
  quantity: number;
  subtotal: number;
  unitPrice: number;
};
type BatchReceipt = ReceiptForm & { sourceLine: number };
type Mode = "single" | "batch";
type AppView = "dashboard" | "receipts" | "ledger" | "create" | "members" | "appearance" | "quotes";
type AuthMode = "loading" | "login" | "register" | "authenticated" | "unavailable";
type SavedReceipt = {
  amount: number;
  businessRegistration: string;
  createdAt: string;
  description: string;
  id: string;
  issueDate: string;
  issuerAddress: string;
  issuerContact: string;
  issuerName: string;
  lineItems?: ReceiptLineItem[];
  notes: string;
  payerAddress: string;
  payerName: string;
  paymentMethod: string;
  paymentStatus?: "pending" | "paid";
  receiptNumber: string;
  sourceQuoteId?: string;
  sourceQuoteNumber?: string;
};
type LedgerEntry = {
  amount: number;
  createdAt: string;
  date: string;
  description: string;
  id: string;
  source: "manual" | "receipt";
  type: "IN" | "OUT";
};
type LedgerEntryForm = Pick<LedgerEntry, "date" | "description" | "type"> & { amount: string };
type LedgerSummary = { balance: number; expense: number; income: number };
type OrganizationProfile = { address: string; bankDetails: string; businessRegistration: string; contact: string; currency: string; email: string; hasLogo: boolean; hasSealImage: boolean; id: string; name: string; phone: string; receiptTemplate: ReceiptTemplate; role: "owner" | "admin" | "operator" | "viewer"; sealUpdatedAt?: string; status: "active" | "suspended"; timeZone: string };
type SessionUser = { email: string; id: string; mustChangePassword: boolean; name: string; organization: OrganizationProfile; platformRole: "USER" | "SUPER_ADMIN" };

const today = new Date().toISOString().slice(0, 10);
const batchColumns = "開立日期,付款人名稱,付款人地址,收款項目／說明,收款金額,付款方式,備註";
const hiddenPaymentMethod = "__hidden__";
const otherPaymentMethod = "__other__";
const paymentMethodOptions = [
  "Bank transfer",
  "Cash",
  "Cheque",
  "Credit card",
  "FPS",
  "PayMe",
] as const;

function newLedgerEntry(): LedgerEntryForm {
  return { amount: "", date: today, description: "", type: "IN" };
}

function paymentMethodSelectValue(value: string) {
  if (value === hiddenPaymentMethod || value === "不顯示") return hiddenPaymentMethod;
  return paymentMethodOptions.includes(value as (typeof paymentMethodOptions)[number]) ? value : otherPaymentMethod;
}

function paymentMethodIsValid(value: string) {
  return value === hiddenPaymentMethod || value.trim().length > 0;
}

function paymentMethodIsHidden(value: string) {
  return value === hiddenPaymentMethod || value === "不顯示";
}

function newReceipt(organization?: Pick<OrganizationProfile, "address" | "businessRegistration" | "contact" | "name">): ReceiptForm {
  return {
    receiptNumber: "",
    issueDate: today,
    issuerName: organization?.name ?? "",
    issuerAddress: organization?.address ?? "",
    businessRegistration: organization?.businessRegistration ?? "",
    issuerContact: organization?.contact ?? "",
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

function receiptFormFromSavedReceipt(receipt: SavedReceipt): ReceiptForm {
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

function parseBatchReceipts(text: string, base: ReceiptForm) {
  const lines = text.split(/\r?\n/).map((line, index) => ({ line: line.trim(), sourceLine: index + 1 })).filter(({ line }) => line);
  if (!lines.length) return { receipts: [] as BatchReceipt[], error: "請先貼上至少一筆收據資料。" };

  const delimiter = lines[0].line.includes("\t") ? "\t" : ",";
  const rows = lines.map(({ line, sourceLine }) => ({ cells: splitDelimitedLine(line, delimiter), sourceLine }));
  const hasHeader = isHeaderRow(rows[0].cells);
  const hasLegacyReceiptNumberColumn = hasHeader && /收據編號/i.test(rows[0].cells[0] ?? "");
  const dataRows = hasHeader ? rows.slice(1) : rows;
  if (!dataRows.length) return { receipts: [] as BatchReceipt[], error: "找不到可生成的收據資料，請確認標題列下方有內容。" };

  const receipts: BatchReceipt[] = [];
  for (let index = 0; index < dataRows.length; index += 1) {
    const { cells, sourceLine } = dataRows[index];
    const values = hasLegacyReceiptNumberColumn || cells.length >= 8 ? cells.slice(1) : cells;
    const [issueDate, payerName, payerAddress, description, amount, paymentMethod, notes] = values;
    if (values.length < 5 || !payerName || !description || !amount || !Number.isFinite(Number(amount)) || Number(amount) < 0) {
      return { receipts: [] as BatchReceipt[], error: `第 ${sourceLine} 行資料不完整：付款人、項目與有效金額為必填。` };
    }

    const date = issueDate || base.issueDate || today;
    receipts.push({
      ...base,
      receiptNumber: "",
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
    "2026-08-26,陳大文,香港九龍尖沙咀,活動報名費,1500,Bank transfer,Thank you for your payment.",
    "2026-08-26,李小明,香港新界沙田,顧問服務費,2800,FPS,",
    "2026-08-26,王小姐,香港島中環,場地租借,6000,不顯示,",
    "2026-08-26,陳先生,香港九龍觀塘,設計訂金,3200,Stripe,",
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
  const [batchReceipts, setBatchReceipts] = useState<BatchReceipt[]>([]);
  const [batchError, setBatchError] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("loading");
  const [authPassword, setAuthPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [appView, setAppView] = useState<AppView>("dashboard");
  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordNext, setPasswordNext] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [savedReceiptVersion, setSavedReceiptVersion] = useState(0);
  const [savedReceipts, setSavedReceipts] = useState<SavedReceipt[]>([]);
  const [receiptToPrint, setReceiptToPrint] = useState<SavedReceipt | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerSummary, setLedgerSummary] = useState<LedgerSummary>({ balance: 0, expense: 0, income: 0 });
  const [ledgerVersion, setLedgerVersion] = useState(0);
  const [descriptionSuggestions, setDescriptionSuggestions] = useState<string[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const formattedAmount = useMemo(() => formatAmount(form.amount), [form.amount]);

  useEffect(() => {
    void fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => ({ data: await response.json(), ok: response.ok }))
      .then(({ data, ok }) => {
        if (!ok) {
          setAuthMessage(data.message ?? "資料庫無法連線。");
          setAuthMode("unavailable");
          return;
        }
        if (data.user) {
          setForm(newReceipt(data.user.organization));
          setUser(data.user);
          setAuthMode("authenticated");
          return;
        }
        setAuthMode("login");
      })
      .catch(() => {
        setAuthMessage("資料庫無法連線。");
        setAuthMode("unavailable");
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    void fetch("/api/receipts", { cache: "no-store" })
      .then(async (response) => ({ data: await response.json(), ok: response.ok }))
      .then(({ data, ok }) => {
        if (ok) {
          setSavedReceipts(data.receipts ?? []);
          setDescriptionSuggestions(data.descriptionSuggestions ?? []);
        }
      });
  }, [savedReceiptVersion, user]);

  useEffect(() => {
    if (!user) return;
    void fetch("/api/ledger", { cache: "no-store" })
      .then(async (response) => ({ data: await response.json(), ok: response.ok }))
      .then(({ data, ok }) => {
        if (ok) {
          setLedgerEntries(data.entries ?? []);
          setLedgerSummary(data.summary ?? { balance: 0, expense: 0, income: 0 });
        }
      });
  }, [ledgerVersion, user]);

  function update(field: keyof ReceiptForm, value: string) {
    setSubmitted(false);
    setBatchError("");
    setSaveMessage("");
    setForm((current) => ({ ...current, [field]: value }));
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setSubmitted(false);
    setBatchError("");
  }

  async function printReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReceiptToPrint(null);
    setSubmitted(true);
    const required = [form.issuerName, form.payerName, form.description, form.amount];
    if (required.some((value) => !value.trim()) || !paymentMethodIsValid(form.paymentMethod)) return;
    setBatchReceipts([]);
    const receiptNumbers = await saveReceipts([form]);
    if (receiptNumbers?.[0]) {
      setForm((current) => ({ ...current, receiptNumber: receiptNumbers[0] }));
      window.setTimeout(() => window.print(), 80);
    }
  }

  async function generateBatch() {
    setReceiptToPrint(null);
    if (!form.issuerName.trim()) {
      setBatchError("請先填妥收款方名稱，這項資料會套用到每一張收據。");
      return;
    }
    const result = parseBatchReceipts(batchText, form);
    setBatchError(result.error);
    if (!result.error) {
      const receiptNumbers = await saveReceipts(result.receipts);
      if (receiptNumbers) {
        setBatchReceipts(result.receipts.map((receipt, index) => ({ ...receipt, receiptNumber: receiptNumbers[index] })));
        window.setTimeout(() => window.print(), 80);
      }
    }
  }

  async function importBatchFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setBatchError("檔案不可超過 5 MB。請分拆資料後再匯入。");
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["csv", "tsv", "txt", "xlsx", "xls"].includes(extension)) {
      setBatchError("請選擇 CSV、TSV、TXT、XLSX 或 XLS 檔案。");
      return;
    }

    try {
      const text = extension === "xlsx" || extension === "xls"
        ? await (async () => {
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          if (!firstSheet) throw new Error("EMPTY_SHEET");
          return XLSX.utils.sheet_to_csv(firstSheet, { blankrows: false });
        })()
        : await file.text();
      if (!text.trim()) throw new Error("EMPTY_FILE");
      setBatchText(text.replace(/^\uFEFF/, "").trim());
      setBatchReceipts([]);
      setBatchError("");
      setSaveMessage(`已匯入「${file.name}」，請確認資料後生成收據。`);
    } catch {
      setBatchError("無法讀取檔案。請確認第一個工作表含有正確的收據欄位。");
    }
  }

  function resetReceipt() {
    setForm(newReceipt(user?.organization));
    setSubmitted(false);
    setBatchText("");
    setBatchReceipts([]);
    setBatchError("");
    setSaveMessage("");
  }

  function startReceipt() {
    resetReceipt();
    setAppView("create");
  }

  async function saveReceiptTemplate(receiptTemplate: ReceiptTemplate) {
    const response = await fetch("/api/organization/receipt-template", {
      body: JSON.stringify(receiptTemplate),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message ?? "無法儲存收據樣式。");
    setUser((current) => current ? { ...current, organization: { ...current.organization, receiptTemplate: data.receiptTemplate } } : current);
  }

  function markSealUploaded(sealUpdatedAt: string) {
    setUser((current) => current ? { ...current, organization: { ...current.organization, hasSealImage: true, sealUpdatedAt } } : current);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authMode !== "login") return;

    setAuthMessage("");
    const response = await fetch("/api/auth/login", {
      body: JSON.stringify({ email: authEmail, password: authPassword }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setAuthMessage(data.message ?? "無法登入。" );
      return;
    }
    setAuthPassword("");
    setForm(newReceipt(data.user.organization));
    setUser(data.user);
    setAuthMode("authenticated");
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setSavedReceipts([]);
    setReceiptToPrint(null);
    setLedgerEntries([]);
    setLedgerSummary({ balance: 0, expense: 0, income: 0 });
    setForm(newReceipt());
    setDescriptionSuggestions([]);
    setAuthMode("login");
    setSaveMessage("");
  }

  async function changeOwnPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordNext !== passwordRepeat) {
      setPasswordMessage("兩次輸入的新密碼不一致。");
      return;
    }
    const response = await fetch("/api/auth/password", { body: JSON.stringify({ currentPassword: passwordCurrent, nextPassword: passwordNext }), headers: { "content-type": "application/json" }, method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setPasswordMessage(data.message ?? "無法修改密碼。");
      return;
    }
    setUser((current) => current ? { ...current, mustChangePassword: false } : current);
    setPasswordCurrent("");
    setPasswordNext("");
    setPasswordRepeat("");
  }

  async function saveReceipts(receipts: ReceiptForm[]): Promise<string[] | null> {
    if (!receipts.length) return null;
    const required = receipts.every((receipt) => [receipt.issueDate, receipt.issuerName, receipt.payerName, receipt.description, receipt.amount].every((value) => value.trim()) && paymentMethodIsValid(receipt.paymentMethod));
    const validAmounts = receipts.every((receipt) => Number.isFinite(Number(receipt.amount)) && Number(receipt.amount) >= 0);
    if (!required || !validAmounts) {
      setSubmitted(true);
      setSaveMessage("請先填妥所有必填欄位，並確認金額有效。");
      return null;
    }

    setIsSaving(true);
    setSaveMessage("");
    const response = await fetch("/api/receipts", {
      body: JSON.stringify({ receipts: receipts.map(serializeReceipt) }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const data = await response.json().catch(() => ({}));
    setIsSaving(false);
    if (!response.ok) {
      setSaveMessage(data.message ?? "儲存失敗。" );
      if (response.status === 401) {
        setUser(null);
        setAuthMode("login");
      }
      return null;
    }

    const receiptNumbers = Array.isArray(data.receiptNumbers) ? data.receiptNumbers.filter((value: unknown): value is string => typeof value === "string") : [];
    if (receiptNumbers.length !== receipts.length) {
      setSaveMessage("收據已儲存，但無法取得系統派發的編號。請重新整理後到收據中心確認。");
      return null;
    }
    setSaveMessage(`已安全儲存 ${data.count} 張收據。`);
    setSavedReceiptVersion((current) => current + 1);
    return receiptNumbers;
  }

  async function saveLedgerEntry(entry: LedgerEntryForm): Promise<string | null> {
    const response = await fetch("/api/ledger", {
      body: JSON.stringify({ ...entry, amount: Number(entry.amount) }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        setUser(null);
        setAuthMode("login");
      }
      return data.message ?? "無法儲存記帳資料。";
    }
    setLedgerVersion((current) => current + 1);
    return null;
  }

  async function confirmReceiptPayment(receipt: SavedReceipt) {
    const response = await fetch(`/api/receipts/${receipt.id}`, { body: JSON.stringify({ paymentStatus: "paid" }), headers: { "content-type": "application/json" }, method: "PUT" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setSaveMessage(data.message ?? "無法確認收款。"); return; }
    setSavedReceipts((current) => current.map((item) => item.id === receipt.id ? { ...item, paymentStatus: "paid" } : item));
    setLedgerVersion((current) => current + 1);
    setSaveMessage(`${receipt.receiptNumber} 已確認收款，並已列入收入。`);
  }

  function printSavedReceipt(receipt: SavedReceipt) {
    setReceiptToPrint(receipt);
    window.setTimeout(() => window.print(), 80);
  }

  const hasMissingRequired = [form.issuerName, form.payerName, form.description, form.amount]
    .some((value) => !value.trim()) || !paymentMethodIsValid(form.paymentMethod);

  if (!user) {
    if (authMode === "register") {
      return <RegistrationScreen onBack={() => { setAuthMode("login"); setAuthMessage(""); }} onAuthenticated={(registeredUser) => { setForm(newReceipt(registeredUser.organization)); setUser(registeredUser); setAuthMode("authenticated"); }} />;
    }
    return <AuthScreen
      authEmail={authEmail}
      authMessage={authMessage}
      authMode={authMode}
      authPassword={authPassword}
      onAuthEmailChange={setAuthEmail}
      onAuthPasswordChange={setAuthPassword}
      onRegister={() => { setAuthMode("register"); setAuthMessage(""); }}
      onSignIn={submitAuth}
    />;
  }

  if (user.mustChangePassword) {
    return <ChangePasswordScreen currentPassword={passwordCurrent} message={passwordMessage} nextPassword={passwordNext} repeatPassword={passwordRepeat} onCurrentPasswordChange={setPasswordCurrent} onNextPasswordChange={setPasswordNext} onRepeatPasswordChange={setPasswordRepeat} onSubmit={changeOwnPassword} />;
  }

  if (user.organization.status === "suspended") {
    return <WorkspaceSuspendedScreen isSuperAdmin={user.platformRole === "SUPER_ADMIN"} onSignOut={signOut} />;
  }

  // Include the organization id so browsers never reuse an earlier failed image response.
  const companyLogoUrl = user.organization.hasLogo ? `/api/organization/logo?v=${encodeURIComponent(user.organization.id)}` : undefined;
  const companySealUrl = user.organization.hasSealImage ? `/api/organization/seal?v=${encodeURIComponent(user.organization.sealUpdatedAt ?? user.organization.id)}` : undefined;

  return (
    <main className={`app-shell ${batchReceipts.length ? "printing-batch" : ""} ${receiptToPrint ? "printing-saved-receipt" : ""}`}>
      <header className="topbar no-print">
        <div className="brand-lockup">
          <Image className="brand-mark" src="/re-biz-mark.svg" alt="RE-Biz" width={36} height={36} priority />
          <div>
            <p className="eyebrow">RE-BIZ · BUSINESS OPERATIONS</p>
            <h1>RE-Biz</h1>
          </div>
        </div>
        <div className="topbar-actions no-print">
          <span className="organization-pill">{user.organization.name} · {roleLabel(user.organization.role)}</span>
          <p className="topbar-note">{user.name}</p>
          <button className="topbar-logout" type="button" onClick={() => void signOut()}><LogOut size={14} aria-hidden="true" />登出</button>
        </div>
      </header>

      <div className="app-layout">
        <aside className="app-sidebar no-print" aria-label="主要導覽">
          <p className="sidebar-label">工作區</p>
          <nav className="sidebar-nav">
            <button className={appView === "dashboard" ? "active" : ""} type="button" onClick={() => setAppView("dashboard")}><LayoutDashboard size={17} aria-hidden="true" />總覽</button>
            <button className={appView === "ledger" ? "active" : ""} type="button" onClick={() => setAppView("ledger")}><BookOpenText size={17} aria-hidden="true" />收支記帳</button>
            <button className={appView === "receipts" ? "active" : ""} type="button" onClick={() => setAppView("receipts")}><ReceiptText size={17} aria-hidden="true" />收據中心</button>
            <button className={appView === "quotes" ? "active" : ""} type="button" onClick={() => setAppView("quotes")}><FileSignature size={17} aria-hidden="true" />報價單</button>
            {user.organization.role !== "viewer" && <button className={appView === "create" ? "active" : ""} type="button" onClick={startReceipt}><Plus size={17} aria-hidden="true" />新增收據</button>}
          </nav>
          {(user.organization.role === "owner" || user.organization.role === "admin") && <><p className="sidebar-label sidebar-label-settings">設定</p><nav className="sidebar-nav"><button className={appView === "members" ? "active" : ""} type="button" onClick={() => setAppView("members")}><UsersRound size={17} aria-hidden="true" />成員與權限</button><button className={appView === "appearance" ? "active" : ""} type="button" onClick={() => setAppView("appearance")}><Palette size={17} aria-hidden="true" />收據樣式</button></nav></>}
          {user.platformRole === "SUPER_ADMIN" && <><p className="sidebar-label sidebar-label-settings">平台</p><nav className="sidebar-nav"><a className="sidebar-admin-link" href="/admin">Platform Admin</a></nav></>}
          <div className="sidebar-help"><strong>目前公司</strong><span>{user.organization.name}</span><span>{roleLabel(user.organization.role)}</span></div>
        </aside>

        <section className="app-content">
          {appView === "dashboard" && <DashboardView receipts={savedReceipts} user={user} onCreate={startReceipt} />}
          {appView === "ledger" && <LedgerView canCreate={user.organization.role !== "viewer"} currency={user.organization.currency} entries={ledgerEntries} onSave={saveLedgerEntry} summary={ledgerSummary} />}
          {appView === "receipts" && <ReceiptsView currency={user.organization.currency} receipts={savedReceipts} canCreate={user.organization.role !== "viewer"} onConfirmPayment={confirmReceiptPayment} onCreate={startReceipt} onPrint={printSavedReceipt} />}
          {appView === "quotes" && <QuotationWorkspace canManage={user.organization.role !== "viewer"} canManageCompany={user.organization.role === "owner" || user.organization.role === "admin"} organization={user.organization} onOpenReceipts={() => setAppView("receipts")} onOrganizationUpdated={(organization) => setUser((current) => current ? { ...current, organization: { ...current.organization, ...organization } } : current)} />}
          {appView === "members" && (user.organization.role === "owner" || user.organization.role === "admin") && <section className="page-view no-print"><MemberManagement actorId={user.id} actorRole={user.organization.role} allowAdmin={user.organization.role === "owner"} onClose={() => setAppView("dashboard")} /></section>}
          {appView === "appearance" && (user.organization.role === "owner" || user.organization.role === "admin") && <ReceiptAppearanceSettings currency={user.organization.currency} logoUrl={companyLogoUrl} sealUrl={companySealUrl} organization={user.organization} onClose={() => setAppView("dashboard")} onSave={saveReceiptTemplate} onSealUploaded={markSealUploaded} />}
          {appView === "create" && <section className="workspace">
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

          <SavedReceiptList currency={user.organization.currency} receipts={savedReceipts} />

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
                  <label className="field"><span>收據編號</span><output className="read-only-value">{form.receiptNumber || "儲存時自動派號"}</output><small>格式：RC-開立日期-流水號</small></label>
                  <Field label="開立日期" required type="date" value={form.issueDate} onChange={(value) => update("issueDate", value)} />
                </div>
              </fieldset>

              <IssuerFields companyName={user.organization.name} form={form} update={update} required={submitted} />

              <fieldset className="form-section">
                <legend>付款資料</legend>
                <div className="field-grid">
                  <Field label="付款人名稱" required value={form.payerName} placeholder="例如：Chan Tai Man" onChange={(value) => update("payerName", value)} invalid={submitted && !form.payerName.trim()} />
                  <label className="field">
                    <span>付款方式</span>
                    <select value={paymentMethodSelectValue(form.paymentMethod)} onChange={(event) => update("paymentMethod", event.target.value === otherPaymentMethod ? "" : event.target.value)}>
                      {paymentMethodOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                      <option value={otherPaymentMethod}>其他（自行填寫）</option>
                      <option value={hiddenPaymentMethod}>不顯示於收據</option>
                    </select>
                  </label>
                  {paymentMethodSelectValue(form.paymentMethod) === otherPaymentMethod && <Field label="其他付款方式" required value={form.paymentMethod} placeholder="例如：轉數快、支票或自訂方式" onChange={(value) => update("paymentMethod", value)} invalid={submitted && !form.paymentMethod.trim()} />}
                  <Field className="full-span" label="付款人地址（選填）" value={form.payerAddress} placeholder="香港⋯" onChange={(value) => update("payerAddress", value)} />
                  <Field className="full-span" label="收款項目／說明" required value={form.description} placeholder="例如：活動報名費" list={descriptionSuggestions.length ? "description-suggestions" : undefined} onChange={(value) => update("description", value)} invalid={submitted && !form.description.trim()} />
                  {descriptionSuggestions.length > 0 && <><datalist id="description-suggestions">{descriptionSuggestions.map((description) => <option key={description} value={description} />)}</datalist><p className="field-hint full-span">開始輸入即可選擇此公司的歷史收款項目。</p></>}
                  <Field label={`收款金額（${user.organization.currency}）`} required type="number" min="0" step="0.01" value={form.amount} placeholder="0.00" onChange={(value) => update("amount", value)} invalid={submitted && !form.amount.trim()} />
                  <label className="field">
                    <span>收據預覽金額</span>
                    <output className="read-only-value">{user.organization.currency} {formattedAmount}</output>
                  </label>
                  <Field className="full-span" label="備註（選填）" value={form.notes} placeholder="例如：Thank you for your payment." onChange={(value) => update("notes", value)} />
                </div>
              </fieldset>

              {submitted && hasMissingRequired && <p className="validation-message" role="alert">請先填妥所有標示 * 的欄位。</p>}
              <button className="primary-action" disabled={isSaving} type="submit"><FileDown size={18} aria-hidden="true" />{isSaving ? "儲存收據中…" : "儲存並生成 PDF"}</button>
              {saveMessage && <p className="save-message" role="status">{saveMessage}</p>}
              <p className="form-hint">會先把收據寫入收據中心，再開啟列印視窗；選擇「另存為 PDF」即可下載正式收據。如仍看到日期、網址或頁碼，請在「更多設定」關閉「頁首與頁尾」。</p>
            </form>
          ) : (
            <section className="batch-builder" aria-label="批量生成收據">
              <fieldset className="form-section">
                <legend>共用的收款方資料</legend>
                <p className="batch-intro">已根據目前公司「{user.organization.name}」的註冊資料帶入，以下資料會套用到每一張收據；只需設定一次。</p>
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
                <p className="batch-intro">支援直接從 Excel 或 Google Sheets 複製貼上，可包含標題列。欄位順序：開立日期、付款人名稱、付款人地址、收款項目、收款金額、付款方式、備註。系統會依每筆日期自動派發收據編號。付款方式可填 Bank transfer、Cash、Cheque、Credit card、FPS、PayMe 或任何自訂文字；填「不顯示」則不會列印在收據上。日期可留空。</p>
                <label className="batch-file-upload">
                  <FileUp size={20} aria-hidden="true" />
                  <span><strong>上傳批量檔案</strong><small>支援 CSV、TSV、TXT、XLSX、XLS；會讀取第一個工作表</small></span>
                  <input accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv,text/tab-separated-values,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" type="file" onChange={(event) => void importBatchFile(event)} />
                </label>
                <label className="batch-textarea-label">
                  <span>每行一張收據</span>
                  <textarea value={batchText} onChange={(event) => { setBatchText(event.target.value); setBatchError(""); }} placeholder={`${batchColumns}\n${today},陳大文,香港九龍尖沙咀,活動報名費,1500,Bank transfer,Thank you for your payment.\n${today},王小姐,香港島中環,場地租借,6000,不顯示,`} />
                </label>
                <div className="batch-options"><p>收據編號會於儲存時依公司與開立日期自動派發，無需填寫起始流水號。</p></div>
              </fieldset>

              {batchError && <p className="validation-message" role="alert">{batchError}</p>}
              <button className="primary-action" disabled={isSaving} type="button" onClick={() => void generateBatch()}><Rows3 size={18} aria-hidden="true" />{isSaving ? "儲存收據中…" : "儲存並批量生成 PDF"}</button>
              {saveMessage && <p className="save-message" role="status">{saveMessage}</p>}
              <p className="form-hint">會先把每張收據寫入收據中心，再逐頁列印；選擇「另存為 PDF」即可得到多頁檔案。如仍看到日期、網址或頁碼，請在「更多設定」關閉「頁首與頁尾」。</p>
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

          {mode === "single" ? <ReceiptPaper currency={user.organization.currency} receipt={form} logoUrl={companyLogoUrl} sealUrl={companySealUrl} template={user.organization.receiptTemplate} /> : <BatchPreview text={batchText} />}
          <p className="legal-note no-print">此工具提供一般普通收據版面，不包含香港電子發票、報稅或商業登記申報服務。</p>
        </section>
          </section>}
        </section>
      </div>

      <section className="batch-print" aria-label="批量收據列印內容">
        {batchReceipts.map((receipt) => <ReceiptPaper currency={user.organization.currency} key={`${receipt.receiptNumber}-${receipt.sourceLine}`} logoUrl={companyLogoUrl} sealUrl={companySealUrl} receipt={receipt} template={user.organization.receiptTemplate} />)}
      </section>
      {receiptToPrint && <section className="saved-receipt-print" aria-label="收據列印內容"><ReceiptPaper currency={user.organization.currency} logoUrl={companyLogoUrl} receipt={receiptFormFromSavedReceipt(receiptToPrint)} sealUrl={companySealUrl} template={user.organization.receiptTemplate} /></section>}

      <footer className="no-print">
        <span>RE-BIZ · HONG KONG</span>
        <span className="footer-separator">•</span>
        <span>先把收據開對，再談自動化。</span>
      </footer>
    </main>
  );
}

function serializeReceipt(receipt: ReceiptForm): Omit<ReceiptForm, "receiptNumber"> {
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

function AuthScreen({
  authEmail, authMessage, authMode, authPassword, onAuthEmailChange, onAuthPasswordChange, onRegister, onSignIn,
}: {
  authEmail: string; authMessage: string; authMode: AuthMode; authPassword: string; onAuthEmailChange: (value: string) => void; onAuthPasswordChange: (value: string) => void; onRegister: () => void; onSignIn: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return <main className="auth-shell">
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="brand-lockup">
        <Image className="brand-mark" src="/re-biz-mark.svg" alt="RE-Biz" width={36} height={36} priority />
        <div><p className="eyebrow">RE-BIZ · BUSINESS OPERATIONS</p><h1>RE-Biz</h1></div>
      </div>
      {authMode === "loading" ? <p className="auth-status">正在連接帳號系統⋯</p> : authMode === "unavailable" ? <p className="auth-status auth-status-error">{authMessage || "帳號系統暫時無法使用。"}</p> : <>
        <div className="auth-heading"><p className="eyebrow">ACCOUNT</p><h2 id="auth-title">登入系統</h2><p>登入既有公司工作空間，或建立一個全新的 RE-Biz 公司帳號。</p></div>
        <form className="auth-form" onSubmit={onSignIn}>
          <label><span>電郵</span><input autoComplete="email" type="email" value={authEmail} onChange={(event) => onAuthEmailChange(event.target.value)} placeholder="you@example.com" required /></label>
          <label><span>密碼</span><input autoComplete="current-password" type="password" minLength={1} value={authPassword} onChange={(event) => onAuthPasswordChange(event.target.value)} placeholder="輸入密碼" required /></label>
          {authMessage && <p className="validation-message" role="alert">{authMessage}</p>}
          <button className="auth-submit" type="submit"><LogIn size={16} aria-hidden="true" />登入</button>
          <button className="auth-switch-button" type="button" onClick={onRegister}>建立你的公司帳號</button>
        </form>
      </>}
    </section>
  </main>;
}

function RegistrationScreen({ onAuthenticated, onBack }: { onAuthenticated: (user: SessionUser) => void; onBack: () => void }) {
  const [address, setAddress] = useState("");
  const [businessRegistration, setBusinessRegistration] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contact, setContact] = useState("");
  const [currency, setCurrency] = useState("HKD");
  const [email, setEmail] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [timeZone, setTimeZone] = useState("Asia/Hong_Kong");

  function continueToCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== passwordRepeat) { setMessage("兩次輸入的密碼不一致。"); return; }
    setMessage("");
    setStep(2);
  }

  function selectLogo(file?: File) {
    if (!file) return;
    if (!(["image/png", "image/jpeg", "image/svg+xml"] as string[]).includes(file.type) || file.size > 1_000_000) {
      setMessage("Logo 只支援 PNG、JPG 或 SVG，且檔案需小於 1 MB。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
    setMessage("");
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/auth/register", {
      body: JSON.stringify({ address, businessRegistration, companyName, contact, currency, email, logoDataUrl: logoDataUrl || undefined, name, password, timeZone }),
      headers: { "content-type": "application/json" }, method: "POST",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(data.message ?? "無法建立公司帳號。"); return; }
    onAuthenticated(data.user);
  }

  return <main className="auth-shell"><section className="auth-card registration-card" aria-labelledby="registration-title">
    <div className="brand-lockup"><Image className="brand-mark" src="/re-biz-mark.svg" alt="RE-Biz" width={36} height={36} priority /><div><p className="eyebrow">CREATE WORKSPACE</p><h1>RE-Biz</h1></div></div>
    <div className="registration-progress" aria-label={`註冊第 ${step} 步，共 2 步`}><span className={step === 1 ? "active" : "complete"}>1</span><i /><span className={step === 2 ? "active" : ""}>2</span></div>
    {step === 1 ? <><div className="auth-heading"><p className="eyebrow">STEP 1 OF 2</p><h2 id="registration-title">建立你的帳號</h2><p>你會成為新公司工作空間的 Owner，之後可自行新增同事與設定權限。</p></div><form className="auth-form" onSubmit={continueToCompany}>
      <label><span>姓名</span><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="你的名稱" required /></label>
      <label><span>工作 Email</span><input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></label>
      <label><span>密碼</span><input autoComplete="new-password" type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 12 個字元" required /></label>
      <label><span>確認密碼</span><input autoComplete="new-password" type="password" minLength={12} value={passwordRepeat} onChange={(event) => setPasswordRepeat(event.target.value)} required /></label>
      {message && <p className="validation-message" role="alert">{message}</p>}
      <button className="auth-submit" type="submit">下一步：建立公司</button><button className="auth-switch-button" type="button" onClick={onBack}>已有帳號？登入</button>
    </form></> : <><div className="auth-heading"><p className="eyebrow">STEP 2 OF 2</p><h2 id="registration-title">設定公司資料</h2><p>這些資料會成為你的公司工作空間；Logo 與聯絡資料可稍後再修改。</p></div><form className="auth-form registration-form" onSubmit={submitRegistration}>
      <label><span>公司／商號名稱</span><input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="例如：RE Company Limited" required /></label>
      <label><span>公司 Logo（選填）</span><span className="logo-upload"><input accept="image/png,image/jpeg,image/svg+xml" type="file" onChange={(event) => selectLogo(event.target.files?.[0])} />{logoDataUrl ? <Image src={logoDataUrl} alt="公司 Logo 預覽" width={48} height={48} unoptimized /> : <span>上傳 PNG、JPG 或 SVG（小於 1 MB）</span>}</span></label>
      <div className="registration-two-columns"><label><span>地區／時區</span><select value={timeZone} onChange={(event) => setTimeZone(event.target.value)}><option value="Asia/Hong_Kong">香港（GMT+8）</option><option value="Asia/Taipei">台灣（GMT+8）</option><option value="UTC">UTC</option></select></label><label><span>幣別</span><select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="HKD">HKD</option><option value="TWD">TWD</option><option value="USD">USD</option></select></label></div>
      <label><span>商業登記號碼（選填）</span><input value={businessRegistration} onChange={(event) => setBusinessRegistration(event.target.value)} /></label>
      <label><span>地址（選填）</span><input value={address} onChange={(event) => setAddress(event.target.value)} /></label>
      <label><span>聯絡資料（選填）</span><input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="電話或 Email" /></label>
      {message && <p className="validation-message" role="alert">{message}</p>}
      <button className="auth-submit" type="submit"><UserPlus size={16} aria-hidden="true" />建立公司並進入 RE-Biz</button><button className="auth-switch-button" type="button" onClick={() => { setMessage(""); setStep(1); }}>返回上一步</button>
    </form></>}
  </section></main>;
}

function ChangePasswordScreen({ currentPassword, message, nextPassword, repeatPassword, onCurrentPasswordChange, onNextPasswordChange, onRepeatPasswordChange, onSubmit }: {
  currentPassword: string; message: string; nextPassword: string; repeatPassword: string; onCurrentPasswordChange: (value: string) => void; onNextPasswordChange: (value: string) => void; onRepeatPasswordChange: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return <main className="auth-shell"><section className="auth-card" aria-labelledby="password-title">
    <div className="brand-lockup"><Image className="brand-mark" src="/re-biz-mark.svg" alt="RE-Biz" width={36} height={36} priority /><div><p className="eyebrow">SECURITY CHECK</p><h1>RE-Biz</h1></div></div>
    <div className="auth-heading"><p className="eyebrow">FIRST SIGN-IN</p><h2 id="password-title">請設定你的新密碼</h2><p>這是管理者提供的暫用密碼。為保護帳號，請先設定只有你知道的新密碼。</p></div>
    <form className="auth-form" onSubmit={onSubmit}>
      <label><span>目前的暫用密碼</span><input autoComplete="current-password" type="password" value={currentPassword} onChange={(event) => onCurrentPasswordChange(event.target.value)} required /></label>
      <label><span>新密碼</span><input autoComplete="new-password" type="password" minLength={12} value={nextPassword} onChange={(event) => onNextPasswordChange(event.target.value)} placeholder="至少 12 個字元" required /></label>
      <label><span>再次輸入新密碼</span><input autoComplete="new-password" type="password" minLength={12} value={repeatPassword} onChange={(event) => onRepeatPasswordChange(event.target.value)} required /></label>
      {message && <p className="validation-message" role="alert">{message}</p>}
      <button className="auth-submit" type="submit"><KeyRound size={16} aria-hidden="true" />儲存新密碼</button>
    </form>
  </section></main>;
}

function WorkspaceSuspendedScreen({ isSuperAdmin, onSignOut }: { isSuperAdmin: boolean; onSignOut: () => Promise<void> }) {
  return <main className="auth-shell"><section className="auth-card" aria-labelledby="workspace-suspended-title">
    <div className="brand-lockup"><Image className="brand-mark" src="/re-biz-mark.svg" alt="RE-Biz" width={36} height={36} priority /><div><p className="eyebrow">WORKSPACE STATUS</p><h1>RE-Biz</h1></div></div>
    <div className="auth-heading"><p className="eyebrow">ACCESS PAUSED</p><h2 id="workspace-suspended-title">This workspace has been suspended.</h2><p>Please contact support for assistance. Your workspace data has been retained.</p></div>
    {isSuperAdmin && <a className="auth-submit" href="/admin">前往 Platform Admin</a>}
    <button className="auth-switch-button" type="button" onClick={() => void onSignOut()}>登出</button>
  </section></main>;
}

function roleLabel(role: SessionUser["organization"]["role"]) {
  return ({ owner: "擁有者", admin: "管理者", operator: "操作員", viewer: "檢視者" })[role];
}

function MemberManagement({ actorId, actorRole, allowAdmin, onClose }: { actorId: string; actorRole: SessionUser["organization"]["role"]; allowAdmin: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [members, setMembers] = useState<Array<{ email: string; id: string; mustChangePassword: boolean; name: string; role: "owner" | "admin" | "operator" | "viewer"; status: "active" | "suspended" }>>([]);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "operator" | "viewer">("operator");

  async function loadMembers() {
    const response = await fetch("/api/members", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setMembers(data.members ?? []); else setMessage(data.message ?? "無法讀取成員資料。");
  }

  useEffect(() => {
    const loadTimer = window.setTimeout(() => { void loadMembers(); }, 0);
    return () => window.clearTimeout(loadTimer);
  }, []);

  async function createNewMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/members", { body: JSON.stringify({ email, name, password, role }), headers: { "content-type": "application/json" }, method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(data.message ?? "無法建立帳號。"); return; }
    setEmail(""); setName(""); setPassword(""); setRole("operator");
    setMessage(`已建立 ${data.member.name} 的帳號；請安全地提供暫用密碼。`);
    await loadMembers();
  }

  async function changeMemberStatus(member: { id: string; name: string; status: "active" | "suspended" }) {
    const nextStatus = member.status === "active" ? "suspended" : "active";
    setMessage("");
    const response = await fetch(`/api/members/${member.id}`, { body: JSON.stringify({ status: nextStatus }), headers: { "content-type": "application/json" }, method: "PATCH" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(data.message ?? "無法更新成員狀態。"); return; }
    setMessage(`${member.name} 已${nextStatus === "active" ? "重新啟用" : "停用"}。`);
    await loadMembers();
  }

  return <section className="member-management" aria-labelledby="members-title">
    <div className="member-heading"><div><p className="eyebrow">TEAM ACCESS</p><h3 id="members-title">成員管理</h3></div><button className="reset-button" type="button" onClick={onClose}>關閉</button></div>
    <form className="member-form" onSubmit={createNewMember}>
      <label><span>姓名</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
      <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label><span>角色</span><select value={role} onChange={(event) => setRole(event.target.value as "admin" | "operator" | "viewer")}><option value="operator">操作員</option><option value="viewer">檢視者</option>{allowAdmin && <option value="admin">管理者</option>}</select></label>
      <label><span>暫用密碼</span><input type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 12 個字元" required /></label>
      <button className="member-create" type="submit"><UserPlus size={15} aria-hidden="true" />新增帳號</button>
    </form>
    {message && <p className="member-message" role="status">{message}</p>}
    <ul className="member-list">{members.map((member) => <li key={member.id}><div><strong>{member.name}</strong><span>{member.email}</span></div><div><em>{roleLabel(member.role)}</em><span className={member.status === "active" ? "member-active" : "member-suspended"}>{member.status === "active" ? (member.mustChangePassword ? "待改密碼" : "啟用中") : "已停用"}</span>{member.id !== actorId && member.role !== "owner" && !(actorRole === "admin" && member.role === "admin") && <button className="member-status-button" type="button" onClick={() => void changeMemberStatus(member)}>{member.status === "active" ? "停用" : "重新啟用"}</button>}</div></li>)}</ul>
  </section>;
}

function SavedReceiptList({ currency, receipts }: { currency: string; receipts: SavedReceipt[] }) {
  return <section className="saved-receipts" aria-label="已儲存收據">
    <p>最近儲存的收據</p>
    {receipts.length ? <ul>{receipts.map((receipt) => <li key={receipt.id}><strong>{receipt.receiptNumber}</strong><span>{receipt.issueDate} · {receipt.payerName} · {currency} {formatAmount(String(receipt.amount))}</span></li>)}</ul> : <span>目前尚未有已儲存的收據。</span>}
  </section>;
}

function LedgerView({ canCreate, currency, entries, onSave, summary }: { canCreate: boolean; currency: string; entries: LedgerEntry[]; onSave: (entry: LedgerEntryForm) => Promise<string | null>; summary: LedgerSummary }) {
  const [form, setForm] = useState<LedgerEntryForm>(newLedgerEntry);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    const amount = Number(form.amount);
    if (!form.date || !form.description.trim() || !Number.isFinite(amount) || amount <= 0) return;

    setIsSaving(true);
    setMessage("");
    const error = await onSave({ ...form, description: form.description.trim() });
    setIsSaving(false);
    if (error) {
      setMessage(error);
      return;
    }
    setForm(newLedgerEntry());
    setSubmitted(false);
    setMessage("已儲存收支紀錄。");
  }

  return <section className="page-view ledger-view no-print" aria-labelledby="ledger-title">
    <div className="page-heading"><div><p className="eyebrow">CASH FLOW</p><h2 id="ledger-title">收支記帳</h2><p>已儲存的收據會自動列為收入 IN；這裡只需補記沒有開收據的收入與所有支出。</p></div></div>
    <div className="metric-grid ledger-metric-grid"><article><span>總收入 IN</span><strong className="amount-income">{currency} {formatAmount(String(summary.income))}</strong><small>包含已儲存收據與手動收入</small></article><article><span>總支出 OUT</span><strong className="amount-expense">{currency} {formatAmount(String(summary.expense))}</strong><small>所有手動支出紀錄</small></article><article><span>目前餘額</span><strong>{currency} {formatAmount(String(summary.balance))}</strong><small>收入減支出</small></article></div>
    <div className="ledger-layout">
      <section className="ledger-card ledger-form-card">
        <div className="card-heading"><div><p className="eyebrow">NEW ENTRY</p><h3>新增一筆收支</h3></div></div>
        {canCreate ? <form className="ledger-form" onSubmit={(event) => void submit(event)}>
          <label className="field"><span>類型 <b>*</b></span><select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as LedgerEntry["type"] }))}><option value="IN">收入 IN</option><option value="OUT">支出 OUT</option></select></label>
          <label className="field"><span>日期 <b>*</b></span><input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></label>
          <label className="field full-span"><span>說明 <b>*</b></span><input aria-invalid={submitted && !form.description.trim()} maxLength={500} placeholder="例如：客戶服務費、辦公室租金" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
          <label className="field full-span"><span>金額（{currency}）<b>*</b></span><input aria-invalid={submitted && (!Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0)} inputMode="decimal" min="0.01" placeholder="0.00" step="0.01" type="number" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} /></label>
          {submitted && (!form.date || !form.description.trim() || !Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) && <p className="validation-message">請填妥日期、說明與大於 0 的金額。</p>}
          <button className="primary-action" disabled={isSaving} type="submit">{isSaving ? "儲存中…" : "儲存收支紀錄"}</button>
          {message && <p className="save-message" role="status">{message}</p>}
        </form> : <p className="ledger-read-only">你的角色只有檢視權限，可查看所有收支紀錄與餘額。</p>}
      </section>
      <section className="ledger-card ledger-list-card"><div className="card-heading"><div><p className="eyebrow">RECENT ENTRIES</p><h3>收支紀錄</h3></div><span className="ledger-count">顯示最近 {entries.length} 筆</span></div>{entries.length ? <div className="ledger-table-list"><div className="ledger-table-header"><span>類型</span><span>說明</span><span>日期</span><span>金額</span></div>{entries.map((entry) => <div className="ledger-table-row" key={entry.id}><span className={`ledger-type ${entry.type === "IN" ? "income" : "expense"}`}>{entry.type === "IN" ? <ArrowUpRight size={15} aria-hidden="true" /> : <ArrowDownRight size={15} aria-hidden="true" />}{entry.type}</span><strong>{entry.description}{entry.source === "receipt" && <small className="ledger-source">由收據自動帶入</small>}</strong><span>{entry.date}</span><b className={entry.type === "IN" ? "amount-income" : "amount-expense"}>{entry.type === "IN" ? "+" : "−"}{currency} {formatAmount(String(entry.amount))}</b></div>)}</div> : <div className="empty-ledger"><BookOpenText size={28} aria-hidden="true" /><h3>尚未有收支紀錄</h3><p>{canCreate ? "從第一筆收入或支出開始，系統會自動統計餘額。" : "目前尚未有可查看的收支紀錄。"}</p></div>}</section>
    </div>
  </section>;
}

function DashboardView({ receipts, user, onCreate }: { receipts: SavedReceipt[]; user: SessionUser; onCreate: () => void }) {
  const total = receipts.filter((receipt) => receipt.paymentStatus !== "pending").reduce((sum, receipt) => sum + receipt.amount, 0);
  return <section className="page-view dashboard-view no-print" aria-labelledby="dashboard-title">
    <div className="page-heading"><div><p className="eyebrow">OVERVIEW</p><h2 id="dashboard-title">早安，{user.name}</h2><p>這裡是 {user.organization.name} 的日常營運概況。</p></div></div>
    <div className="metric-grid"><article><span>最近收據</span><strong>{receipts.length}</strong><small>目前顯示最近 20 筆</small></article><article><span>最近收款總額</span><strong>{user.organization.currency} {formatAmount(String(total))}</strong><small>以已儲存收據計算</small></article><article><span>你的權限</span><strong>{roleLabel(user.organization.role)}</strong><small>{user.organization.role === "viewer" ? "可查看收據與報表" : "可處理日常收據作業"}</small></article></div>
    <div className="dashboard-grid"><section className="dashboard-card"><div className="card-heading"><div><p className="eyebrow">RECENT ACTIVITY</p><h3>最近儲存的收據</h3></div>{user.organization.role !== "viewer" && <button className="text-button" type="button" onClick={onCreate}>新增收據</button>}</div>{receipts.length ? <ul className="receipt-summary-list">{receipts.slice(0, 5).map((receipt) => <li key={receipt.id}><div><strong>{receipt.receiptNumber}</strong><span>{receipt.payerName} · {receipt.issueDate}</span></div><b>{user.organization.currency} {formatAmount(String(receipt.amount))}</b></li>)}</ul> : <EmptyReceipts onCreate={onCreate} canCreate={user.organization.role !== "viewer"} />}</section>
    <aside className="dashboard-card next-steps"><p className="eyebrow">GET STARTED</p><h3>下一步可以做什麼？</h3><ol><li>確認公司收款方資料</li><li>建立第一張收據</li><li>需要協作時新增成員</li></ol></aside></div>
  </section>;
}

function ReceiptsView({ currency, receipts, canCreate, onConfirmPayment, onCreate, onPrint }: { currency: string; receipts: SavedReceipt[]; canCreate: boolean; onConfirmPayment: (receipt: SavedReceipt) => void; onCreate: () => void; onPrint: (receipt: SavedReceipt) => void }) {
  return <section className="page-view receipts-view no-print" aria-labelledby="receipts-title"><div className="page-heading"><div><p className="eyebrow">RECEIPT CENTER</p><h2 id="receipts-title">收據中心</h2><p>由報價單建立的收據草稿會先標示為待收款；確認收款後才會列為收入。</p></div>{canCreate && <button className="page-primary-action" type="button" onClick={onCreate}><Plus size={17} aria-hidden="true" />新增收據</button>}</div>
    <section className="receipts-table-card">{receipts.length ? <div className="receipt-table-list receipt-table-with-status"><div className="receipt-table-header"><span>收據編號</span><span>付款人</span><span>開立日期</span><span>金額</span><span>收款狀態</span></div>{receipts.map((receipt) => <div className="receipt-list-entry" key={receipt.id}><div className="receipt-table-row"><strong>{receipt.receiptNumber}{receipt.sourceQuoteNumber && <small className="ledger-source">來源：{receipt.sourceQuoteNumber}</small>}</strong><span>{receipt.payerName}</span><span>{receipt.issueDate}</span><b>{currency} {formatAmount(String(receipt.amount))}</b><span>{receipt.paymentStatus === "pending" ? canCreate ? <button className="text-button" type="button" onClick={() => onConfirmPayment(receipt)}>確認收款</button> : <em className="receipt-pending">待收款</em> : <em className="receipt-paid">已收款</em>}</span></div>{receipt.lineItems?.length ? <details className="receipt-line-details"><summary>查看 {receipt.lineItems.length} 項報價明細</summary><ReceiptLineItemsDetail currency={currency} lineItems={receipt.lineItems} onPrint={() => onPrint(receipt)} /></details> : null}</div>)}</div> : <EmptyReceipts onCreate={onCreate} canCreate={canCreate} />}</section>
  </section>;
}

function ReceiptLineItemsDetail({ currency, lineItems, onPrint }: { currency: string; lineItems: ReceiptLineItem[]; onPrint: () => void }) {
  return <div className="receipt-line-detail-content"><div className="receipt-line-detail-actions"><span>完整品項明細</span><button className="text-button" type="button" onClick={onPrint}><FileDown size={14} aria-hidden="true" />列印收據</button></div><div className="receipt-line-detail-table"><div className="receipt-line-detail-header"><span>品項</span><span>數量</span><span>單價</span><span>折扣</span><span>小計</span></div>{lineItems.map((item, index) => <div className="receipt-line-detail-row" key={`${item.name}-${index}`}><span><strong>{item.name}</strong>{item.description && <small>{item.description}</small>}</span><span>{item.quantity}</span><span>{currency} {formatAmount(String(item.unitPrice))}</span><span>{currency} {formatAmount(String(item.discountAmount))}</span><b>{currency} {formatAmount(String(item.subtotal))}</b></div>)}</div></div>;
}

function EmptyReceipts({ canCreate, onCreate }: { canCreate: boolean; onCreate: () => void }) {
  return <div className="empty-receipts"><ReceiptText size={28} aria-hidden="true" /><h3>尚未建立收據</h3><p>{canCreate ? "從一張收據開始，之後可在這裡快速找到所有紀錄。" : "目前尚未有可查看的收據紀錄。"}</p>{canCreate && <button className="text-button" type="button" onClick={onCreate}>建立第一張收據</button>}</div>;
}

function IssuerFields({ companyName, form, update, required }: { companyName: string; form: ReceiptForm; update: (field: keyof ReceiptForm, value: string) => void; required: boolean }) {
  return <fieldset className="form-section">
    <legend>收款方資料</legend>
    <p className="field-hint">已根據目前公司「{companyName}」的註冊資料帶入，可視個別收據調整。</p>
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

function ReceiptAppearanceSettings({
  currency, logoUrl, onClose, onSave, onSealUploaded, organization, sealUrl,
}: {
  currency: string;
  logoUrl?: string;
  onClose: () => void;
  onSave: (template: ReceiptTemplate) => Promise<void>;
  onSealUploaded: (sealUpdatedAt: string) => void;
  organization: OrganizationProfile;
  sealUrl?: string;
}) {
  const [template, setTemplate] = useState<ReceiptTemplate>(organization.receiptTemplate ?? defaultReceiptTemplate);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingSeal, setIsUploadingSeal] = useState(false);
  const [message, setMessage] = useState("");
  const previewReceipt: ReceiptForm = {
    ...newReceipt(organization), amount: "1280", description: "顧問服務費", issueDate: "2026-08-30", payerName: "Chan Tai Man", receiptNumber: "RC-20260830-001",
  };
  const update = <Key extends keyof ReceiptTemplate>(key: Key, value: ReceiptTemplate[Key]) => setTemplate((current) => ({ ...current, [key]: value }));
  const applyPreset = (preset: ReceiptTemplate["preset"]) => setTemplate((current) => ({ ...current, ...receiptTemplatePresets[preset], preset }));

  async function save() {
    setIsSaving(true);
    setMessage("");
    try {
      await onSave(template);
      setMessage("已儲存為公司的預設收據樣式。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法儲存收據樣式。");
    } finally {
      setIsSaving(false);
    }
  }

  async function uploadSeal(file?: File) {
    if (!file) return;
    setIsUploadingSeal(true);
    setMessage("");
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/organization/seal", { body, method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message ?? "無法上傳公司印章。");
      onSealUploaded(data.sealUpdatedAt);
      update("sealSource", "uploaded");
      setMessage("印章已上傳；請儲存公司預設樣式以套用。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法上傳公司印章。");
    } finally {
      setIsUploadingSeal(false);
    }
  }

  const displayOptions: Array<[keyof Pick<ReceiptTemplate, "showBusinessRegistration" | "showContact" | "showPaymentMethod" | "showNotes" | "showSignature" | "showDisclaimer">, string]> = [
    ["showBusinessRegistration", "商業登記號碼"], ["showContact", "聯絡資料"], ["showPaymentMethod", "付款方式"], ["showNotes", "備註"], ["showSignature", "簽署欄"], ["showDisclaimer", "免責聲明"],
  ];

  return <section className="appearance-page no-print">
    <header className="page-heading"><div><p className="eyebrow">RECEIPT APPEARANCE</p><h2>收據樣式設定</h2><p>設定後會套用於此公司日後建立與批量列印的收據。</p></div><button className="close-section" type="button" onClick={onClose}>返回總覽</button></header>
    <div className="appearance-layout">
      <section className="appearance-controls" aria-label="收據樣式控制">
        <div className="appearance-section"><h3>選擇版型</h3><div className="template-picker">
          {(["classic", "minimal", "formal"] as const).map((preset) => <button className={`template-choice ${template.preset === preset ? "active" : ""}`} key={preset} type="button" onClick={() => applyPreset(preset)}><span className={`template-swatch ${preset}`} /><strong>{{ classic: "經典", minimal: "簡約", formal: "正式商務" }[preset]}</strong></button>)}
        </div></div>
        <div className="appearance-section field-grid">
          <Field label="收據標題" value={template.receiptTitle} onChange={(value) => update("receiptTitle", value)} />
          <label className="field"><span>主色</span><input className="color-input" type="color" value={template.accentColor} onChange={(event) => update("accentColor", event.target.value)} /><code>{template.accentColor}</code></label>
          <label className="field full-span"><span>Logo 位置</span><select value={template.logoPosition} onChange={(event) => update("logoPosition", event.target.value as ReceiptTemplate["logoPosition"])}><option value="left">靠左</option><option value="center">置中</option><option value="right">靠右</option></select></label>
        </div>
        <div className="appearance-section seal-settings"><div className="seal-settings-heading"><div><h3>公司印章</h3><p>選擇系統生成的圓印，或上傳公司現有印章圖片。</p></div><label className="seal-enable"><input type="checkbox" checked={template.showSeal} onChange={(event) => update("showSeal", event.target.checked)} /><span>顯示印章</span></label></div><div className="seal-source-picker" role="radiogroup" aria-label="印章來源"><label className={template.sealSource === "generated" ? "active" : ""}><input checked={template.sealSource === "generated"} disabled={!template.showSeal} name="seal-source" type="radio" value="generated" onChange={() => update("sealSource", "generated")} /><strong>系統生成</strong><span>依中英文公司名稱建立圓印</span></label><label className={template.sealSource === "uploaded" ? "active" : ""}><input checked={template.sealSource === "uploaded"} disabled={!template.showSeal} name="seal-source" type="radio" value="uploaded" onChange={() => update("sealSource", "uploaded")} /><strong>上傳印章</strong><span>{organization.hasSealImage ? "使用已上傳的公司印章" : "上傳 PNG、JPG 或 WebP"}</span></label></div>{template.sealSource === "generated" ? <div className="field-grid"><Field disabled={!template.showSeal} label="印章中文名稱" value={template.sealChineseName} placeholder="例如：逆衡隨性工作室" onChange={(value) => update("sealChineseName", value)} /><Field disabled={!template.showSeal} label="印章英文名稱" value={template.sealEnglishName} placeholder="例如：RE-Casual Studio" onChange={(value) => update("sealEnglishName", value)} /></div> : <div className="seal-upload-panel"><div>{sealUrl && <img className="seal-upload-preview" src={sealUrl} alt="已上傳的公司印章" />}<p>{organization.hasSealImage ? "已上傳公司印章；你可以更換為另一個檔案。" : "尚未上傳印章，請先選擇圖片檔。"}</p></div><label className="seal-upload-action"><FileUp size={16} aria-hidden="true" /><span>{isUploadingSeal ? "上傳中…" : organization.hasSealImage ? "更換印章檔案" : "上傳印章檔案"}</span><input accept="image/png,image/jpeg,image/webp" disabled={!template.showSeal || isUploadingSeal} type="file" onChange={(event) => { void uploadSeal(event.target.files?.[0]); event.target.value = ""; }} /></label><small>支援 PNG、JPG、WebP，建議使用透明背景，檔案小於 2 MB。</small></div>}</div>
        <div className="appearance-section"><h3>顯示內容</h3><div className="display-toggles">{displayOptions.map(([key, label]) => <label key={key}><input type="checkbox" checked={template[key]} onChange={(event) => update(key, event.target.checked)} /><span>{label}</span></label>)}</div></div>
        <div className="appearance-actions"><button className="secondary-action" type="button" onClick={() => setTemplate(defaultReceiptTemplate)}>回復預設</button><button className="primary-action" type="button" disabled={isSaving} onClick={() => void save()}>{isSaving ? "儲存中…" : "儲存公司預設樣式"}</button></div>
        {message && <p className="save-message" role="status">{message}</p>}
      </section>
      <section className="appearance-preview"><p className="eyebrow">LIVE PREVIEW</p><h3>樣式預覽</h3><ReceiptPaper currency={currency} logoUrl={logoUrl} sealUrl={sealUrl} receipt={previewReceipt} template={template} /></section>
    </div>
  </section>;
}

function ReceiptPaper({ currency, logoUrl, receipt, sealUrl, template }: { currency: string; logoUrl?: string; receipt: ReceiptForm; sealUrl?: string; template: ReceiptTemplate }) {
  const formattedAmount = formatAmount(receipt.amount);
  const lineItems = receipt.lineItems?.length ? receipt.lineItems : undefined;
  const showPaymentMethod = template.showPaymentMethod && !paymentMethodIsHidden(receipt.paymentMethod);
  const usesUploadedSeal = template.sealSource === "uploaded";
  const showSeal = template.showSeal && (usesUploadedSeal ? Boolean(sealUrl) : Boolean(template.sealChineseName || template.sealEnglishName));
  const showBottom = showPaymentMethod || template.showSignature || showSeal;
  return <article className={`receipt-paper template-${template.preset} logo-${template.logoPosition}`} aria-label="Receipt preview" style={{ "--receipt-accent": template.accentColor } as CSSProperties}>
    <div className="receipt-topline" />
    <div className="receipt-header">
      <div className="issuer-block">
        {logoUrl && <>
          {/* The logo is served by an authenticated API route, so it must bypass Next's image optimizer. */}
          <img className="receipt-company-logo" src={logoUrl} alt="公司 Logo" />
        </>}
        <p className="issuer-name">{receipt.issuerName || "YOUR BUSINESS NAME"}</p>
        {receipt.issuerAddress && <p>{receipt.issuerAddress}</p>}
        {template.showBusinessRegistration && receipt.businessRegistration && <p>BR No. {receipt.businessRegistration}</p>}
        {template.showContact && receipt.issuerContact && <p>{receipt.issuerContact}</p>}
      </div>
      <div className="receipt-title-block"><p className="receipt-title">{template.receiptTitle}</p><p className="receipt-title-cn">收據</p></div>
    </div>
    <div className="receipt-meta"><div><span>Receipt No.</span><strong>{receipt.receiptNumber || "自動派號"}</strong></div><div><span>Date</span><strong>{receipt.issueDate || "—"}</strong></div></div>
    {receipt.sourceQuoteNumber && <p className="receipt-source-quote">Source quotation：{receipt.sourceQuoteNumber}</p>}
    <div className="bill-to"><span>Received from 收到款項自</span><strong>{receipt.payerName || "—"}</strong>{receipt.payerAddress && <p>{receipt.payerAddress}</p>}</div>
    {lineItems ? <table className="receipt-line-items-table"><thead><tr><th>Particulars 項目</th><th>Qty 數量</th><th>Unit price 單價</th><th>Discount 折扣</th><th>Subtotal 小計</th></tr></thead><tbody>{lineItems.map((item, index) => <tr key={`${item.name}-${index}`}><td><strong>{item.name}</strong>{item.description && <small>{item.description}</small>}</td><td>{item.quantity}</td><td>{currency} {formatAmount(String(item.unitPrice))}</td><td>{currency} {formatAmount(String(item.discountAmount))}</td><td>{currency} {formatAmount(String(item.subtotal))}</td></tr>)}</tbody><tfoot><tr><td colSpan={4}>Total 收款總額</td><td>{currency} {formattedAmount}</td></tr></tfoot></table> : <div className="receipt-table"><div className="table-header"><span>Particulars 項目</span><span>Amount ({currency})</span></div><div className="table-row"><span>{receipt.description || "—"}</span><strong>{currency} {formattedAmount}</strong></div><div className="table-total"><span>Total 收款總額</span><strong>{currency} {formattedAmount}</strong></div></div>}
    <div className="amount-words"><span>Amount payable</span><strong>{currency} {formattedAmount}</strong></div>
    {showBottom && <div className={`receipt-bottom ${!showPaymentMethod ? "payment-hidden" : ""}`}>
      {showPaymentMethod && <div className="payment-details"><span>Payment method</span><strong>{receipt.paymentMethod || "—"}</strong>{template.showNotes && receipt.notes && <p>{receipt.notes}</p>}</div>}
      {(template.showSignature || showSeal) && <div className="signature-block">{showSeal && (usesUploadedSeal ? <img className="company-seal company-seal-uploaded" src={sealUrl} alt="公司印章" /> : <CompanySeal chineseName={template.sealChineseName} englishName={template.sealEnglishName} />)}{template.showSignature && <><div className="signature-line" /><span>Authorized signature</span></>}</div>}
    </div>}
    {template.showDisclaimer && <p className="receipt-disclaimer">This receipt acknowledges payment received and is not a tax invoice.</p>}
  </article>;
}

function CompanySeal({ chineseName, englishName }: { chineseName: string; englishName: string }) {
  const chineseLines = chineseName.endsWith("工作室") ? [chineseName.slice(0, -3), "工作室"] : [chineseName.slice(0, Math.ceil(chineseName.length / 2)), chineseName.slice(Math.ceil(chineseName.length / 2))];
  const outerCharacters = englishName.toUpperCase().replace(/\s+/g, "·").split("");
  // A traditional company seal has a generous, separate text band.  Keep the
  // lettering inside that band rather than letting it compete with the centre.
  const outerStartAngle = 154;
  const outerEndAngle = 386;
  return <svg className="company-seal" viewBox="0 0 200 200" role="img" aria-label={`${chineseName} 公司印章`}>
    <circle className="seal-outer-ring" cx="100" cy="100" r="93" />
    <circle className="seal-outer-ring seal-outer-ring-inner" cx="100" cy="100" r="85" />
    <circle className="seal-inner-ring" cx="100" cy="100" r="60" />
    {outerCharacters.map((character, index) => {
      const angle = outerStartAngle + ((outerEndAngle - outerStartAngle) * index) / Math.max(outerCharacters.length - 1, 1);
      const radians = (angle * Math.PI) / 180;
      const x = 100 + 73 * Math.cos(radians);
      const y = 100 + 73 * Math.sin(radians);
      return <text className="seal-outer-letter" dominantBaseline="middle" key={`${character}-${index}`} x={x} y={y} textAnchor="middle" transform={`rotate(${angle + 90} ${x} ${y})`}>{character}</text>;
    })}
    <text className="seal-chinese" x="100" y="89" textAnchor="middle">{chineseLines[0]}</text>
    {chineseLines[1] && <text className="seal-chinese seal-chinese-lower" x="100" y="121" textAnchor="middle">{chineseLines[1]}</text>}
    <g className="seal-flower" transform="translate(100 172)"><line x1="-8" x2="8" y1="0" y2="0" /><line x1="0" x2="0" y1="-8" y2="8" /><line x1="-5.7" x2="5.7" y1="-5.7" y2="5.7" /><line x1="-5.7" x2="5.7" y1="5.7" y2="-5.7" /></g>
  </svg>;
}

function Field({
  label, value, onChange, required, className = "", type = "text", placeholder, min, step, invalid, list, disabled,
}: {
  label: string; value: string; onChange: (value: string) => void; required?: boolean; className?: string; type?: string; placeholder?: string; min?: string; step?: string; invalid?: boolean; list?: string; disabled?: boolean;
}) {
  return <label className={"field " + className}>
    <span>{label}{required && <b aria-hidden="true"> *</b>}</span>
    <input aria-invalid={invalid || undefined} disabled={disabled} type={type} min={min} step={step} list={list} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  </label>;
}
