"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  FileDown,
  FilePlus2,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { FieldHelp, FirstUseGuide } from "@/components/page-guidance";

type Organization = {
  address: string;
  bankDetails: string;
  businessRegistration: string;
  contact: string;
  email: string;
  name: string;
  phone: string;
};
type Customer = {
  address: string;
  businessRegistration: string;
  companyName: string;
  contact: string;
  createdAt?: string;
  email: string;
  id: string;
  name: string;
  notes: string;
  phone: string;
  status?: "active" | "archived";
  updatedAt?: string;
};
type Item = {
  description: string;
  id: string;
  isActive: boolean;
  name: string;
  sku: string;
  unitPrice: number;
};
type Line = {
  description: string;
  discountAmount: number;
  name: string;
  quantity: number;
  subtotal?: number;
  unitPrice: number;
};
type Quote = {
  companySnapshot: Organization;
  customerId?: string;
  customerSnapshot: Customer;
  id: string;
  issueDate: string;
  lines: Array<Line & { subtotal: number }>;
  notes: string;
  quoteNumber: string;
  receiptId?: string;
  invoiceId?: string;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  storedStatus: "draft" | "sent" | "accepted" | "rejected";
  terms: string;
  totalAmount: number;
  totalDiscount: number;
  validUntil: string;
};
type ReceiptLink = {
  id: string;
  paymentStatus: "pending" | "paid";
  receiptNumber: string;
} | null;
type InvoiceLink = { id: string; invoiceNumber: string } | null;
type Screen = "list" | "editor" | "detail" | "customers" | "items" | "company";

const today = new Date().toISOString().slice(0, 10);
const blankCustomer = (): Customer => ({
  address: "",
  businessRegistration: "",
  companyName: "",
  contact: "",
  email: "",
  id: "",
  name: "",
  notes: "",
  phone: "",
  status: "active",
});
const blankItem = (): Item => ({
  description: "",
  id: "",
  isActive: true,
  name: "",
  sku: "",
  unitPrice: 0,
});
const blankLine = (): Line => ({
  description: "",
  discountAmount: 0,
  name: "",
  quantity: 1,
  unitPrice: 0,
});
const blankQuote = () => ({
  customer: blankCustomer(),
  customerId: "",
  issueDate: today,
  lines: [blankLine()],
  notes: "",
  terms: "",
  validUntil: addDays(today, 30),
});

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}
function money(value: number) {
  return new Intl.NumberFormat("en-HK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}
function lineCents(line: Line) {
  return Math.max(
    0,
    Math.round(
      (Math.round(line.unitPrice * 100) * Math.round(line.quantity * 1000)) /
        1000,
    ) - Math.round(line.discountAmount * 100),
  );
}
function lineTotal(line: Line) {
  return lineCents(line) / 100;
}
function totals(lines: Line[]) {
  return {
    amount: lines.reduce((sum, line) => sum + lineCents(line), 0) / 100,
    discount:
      lines.reduce(
        (sum, line) => sum + Math.round(line.discountAmount * 100),
        0,
      ) / 100,
  };
}
function statusText(status: Quote["status"]) {
  return {
    accepted: "已接受",
    draft: "草稿",
    expired: "已失效",
    rejected: "已拒絕",
    sent: "已發送",
  }[status];
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? "操作失敗。請稍後再試。");
  return data as T;
}

export function QuotationWorkspace({
  canManage,
  canManageCompany,
  organization,
  onOrganizationUpdated,
  onOpenReceipts,
  onOpenInvoices,
}: {
  canManage: boolean;
  canManageCompany: boolean;
  organization: Organization;
  onOrganizationUpdated: (organization: Organization) => void;
  onOpenReceipts: () => void;
  onOpenInvoices: () => void;
}) {
  const [screen, setScreen] = useState<Screen>("list");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selected, setSelected] = useState<Quote | null>(null);
  const [receipt, setReceipt] = useState<ReceiptLink>(null);
  const [invoice, setInvoice] = useState<InvoiceLink>(null);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [message, setMessage] = useState("");

  async function loadCustomers() {
    const data = await request<{ customers: Customer[] }>("/api/customers");
    setCustomers(data.customers ?? []);
  }
  async function loadItems() {
    const data = await request<{ items: Item[] }>("/api/items");
    setItems(data.items ?? []);
  }
  async function openQuote(id: string) {
    try {
      const data = await request<{ quote: Quote; receipt: ReceiptLink; invoice: InvoiceLink }>(
        `/api/quotes/${id}`,
      );
      setSelected(data.quote);
      setReceipt(data.receipt);
      setInvoice(data.invoice);
      setScreen("detail");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法讀取報價單。");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([
        request<{ customers: Customer[] }>("/api/customers"),
        request<{ items: Item[] }>("/api/items"),
      ])
        .then(([customerData, itemData]) => {
          setCustomers(customerData.customers ?? []);
          setItems(itemData.items ?? []);
        })
        .catch((error: unknown) =>
          setMessage(error instanceof Error ? error.message : "無法讀取資料。"),
        );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (screen !== "list") return;
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams();
      if (keyword.trim()) query.set("q", keyword.trim());
      if (status !== "all") query.set("status", status);
      void request<{ quotes: Quote[] }>(`/api/quotes?${query}`)
        .then((data) => setQuotes(data.quotes ?? []))
        .catch((error: unknown) =>
          setMessage(
            error instanceof Error ? error.message : "無法讀取報價單。",
          ),
        );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [screen, keyword, status]);

  function newQuote() {
    setSelected(null);
    setReceipt(null);
    setScreen("editor");
    setMessage("");
  }
  async function duplicateQuote() {
    if (!selected) return;
    try {
      const data = await request<{ id: string }>(
        `/api/quotes/${selected.id}/duplicate`,
        { method: "POST" },
      );
      await openQuote(data.id);
      setMessage("已複製為一張新的草稿報價單。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法複製報價單。");
    }
  }
  async function changeStatus(next: "sent" | "accepted" | "rejected") {
    if (!selected) return;
    const consequence = next === "sent"
      ? "標示後，這張草稿將不能再編輯。"
      : next === "accepted"
        ? "確認後，可由這張報價單建立請款單。"
        : "標示後，這張報價單會保留為已拒絕，無法回到草稿編輯。";
    if (!window.confirm(`確定要標示為「${statusText(next)}」？\n${consequence}`)) return;
    try {
      const data = await request<{ quote: Quote }>(
        `/api/quotes/${selected.id}`,
        {
          body: JSON.stringify({ action: "status", status: next }),
          method: "PUT",
        },
      );
      setSelected(data.quote);
      setMessage(`已更新為「${statusText(data.quote.status)}」。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法更新狀態。");
    }
  }
  async function createInvoice() {
    if (!selected) return;
    try {
      const data = await request<{ invoice: NonNullable<InvoiceLink> }>(`/api/quotes/${selected.id}/invoice`, { method: "POST" });
      setInvoice(data.invoice);
      setSelected((current) => current ? { ...current, invoiceId: data.invoice.id } : current);
      setMessage(`已建立請款單 ${data.invoice.invoiceNumber}。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "無法建立請款單。"); }
  }

  if (screen === "editor")
    return (
      <QuoteEditor
        canManage={canManage}
        customers={customers}
        initial={selected}
        items={items}
        onCancel={() => setScreen(selected ? "detail" : "list")}
        onSaved={(quote) => {
          setSelected(quote);
          setReceipt(null);
          setScreen("detail");
          setMessage("已儲存草稿報價單。");
        }}
        onQuickCustomer={async (customer) => {
          const data = await request<{ customer: Customer }>("/api/customers", {
            body: JSON.stringify(customer),
            method: "POST",
          });
          await loadCustomers();
          return data.customer;
        }}
      />
    );
  if (screen === "detail" && selected)
    return (
      <QuoteDetail
        quote={selected}
        receipt={receipt}
        invoice={invoice}
        canManage={canManage}
        message={message}
        onBack={() => setScreen("list")}
        onCreateInvoice={() => void createInvoice()}
        onDuplicate={() => void duplicateQuote()}
        onEdit={() => {
          setScreen("editor");
          setMessage("");
        }}
        onOpenReceipts={onOpenReceipts}
        onOpenInvoices={onOpenInvoices}
        onStatus={(next) => void changeStatus(next)}
      />
    );
  if (screen === "customers")
    return (
      <CustomerManager
        canManage={canManage}
        message={message}
        onBack={() => setScreen("list")}
        onChanged={() => {
          void loadCustomers();
          setMessage("客戶資料已更新。");
        }}
        onOpenQuote={(id) => void openQuote(id)}
      />
    );
  if (screen === "items")
    return (
      <ItemManager
        canManage={canManage}
        items={items}
        message={message}
        onBack={() => setScreen("list")}
        onChanged={() => {
          void loadItems();
          setMessage("常用品項已更新。");
        }}
      />
    );
  if (screen === "company")
    return (
      <CompanyEditor
        canManage={canManageCompany}
        initial={organization}
        message={message}
        onBack={() => setScreen("list")}
        onSaved={(next) => {
          onOrganizationUpdated(next);
          setMessage("公司資料已更新；新報價單會使用這份資料快照。");
        }}
      />
    );

  return (
    <section
      className="page-view quotation-view no-print"
      aria-labelledby="quotes-title"
    >
      <div className="page-heading">
        <div>
          <p className="eyebrow">QUOTATION CENTER</p>
          <h2 id="quotes-title">報價單</h2>
          <p>
            交易前的報價文件；建立收據草稿前，客戶必須接受且報價仍在有效期內。
          </p>
        </div>
        {canManage && (
          <button
            className="page-primary-action"
            type="button"
            onClick={newQuote}
          >
            <FilePlus2 size={17} />
            新增報價單
          </button>
        )}
      </div>
      {!quotes.length && canManage && <FirstUseGuide title="第一次使用報價單？" steps={["建立或選擇客戶", "加入商品或服務，確認數量與價格", "設定有效期限後儲存草稿", "發送給客戶並在確認接受後建立請款單"]} />}
      <div className="quotation-tools">
        <label className="field">
          <span>搜尋</span>
          <input
            placeholder="單號、客戶或聯絡人"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </label>
        <label className="field">
          <span>狀態</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">全部狀態</option>
            <option value="draft">草稿</option>
            <option value="sent">已發送</option>
            <option value="accepted">已接受</option>
            <option value="rejected">已拒絕</option>
            <option value="expired">已失效</option>
          </select>
        </label>
        <div className="quotation-tool-actions">
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setMessage("");
              setScreen("customers");
            }}
          >
            客戶主檔
          </button>
          {canManage && (
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setMessage("");
                setScreen("items");
              }}
            >
              常用品項
            </button>
          )}
          {canManageCompany && (
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setMessage("");
                setScreen("company");
              }}
            >
              公司資料
            </button>
          )}
        </div>
      </div>
      {message && <p className="validation-message">{message}</p>}
      <section className="receipts-table-card quotation-list-card">
        {quotes.length ? (
          <div className="quotation-table-list">
            <div className="quotation-table-header">
              <span>報價單號</span>
              <span>客戶</span>
              <span>開立／有效期</span>
              <span>總金額</span>
              <span>狀態</span>
            </div>
            {quotes.map((quote) => (
              <button
                className="quotation-table-row"
                key={quote.id}
                type="button"
                onClick={() => void openQuote(quote.id)}
              >
                <strong>{quote.quoteNumber}</strong>
                <span>{quote.customerSnapshot.name}</span>
                <span>
                  {quote.issueDate}
                  <small>至 {quote.validUntil}</small>
                </span>
                <b>HKD {money(quote.totalAmount)}</b>
                <em className={`quote-status ${quote.status}`}>
                  {statusText(quote.status)}
                </em>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-receipts">
            <FilePlus2 size={28} />
            <h3>還沒有建立任何報價單</h3>
            <p>
              {canManage
                ? "建立第一張交易前報價單，並在客戶接受後才建立待收款收據草稿。"
                : "目前沒有可查看的報價單。"}
            </p>
            {canManage && (
              <button className="text-button" type="button" onClick={newQuote}>
                建立第一張報價單
              </button>
            )}
          </div>
        )}
      </section>
    </section>
  );
}

function QuoteEditor({
  canManage,
  customers,
  initial,
  items,
  onCancel,
  onQuickCustomer,
  onSaved,
}: {
  canManage: boolean;
  customers: Customer[];
  initial: Quote | null;
  items: Item[];
  onCancel: () => void;
  onQuickCustomer: (customer: Omit<Customer, "id">) => Promise<Customer>;
  onSaved: (quote: Quote) => void;
}) {
  const [form, setForm] = useState(() =>
    initial
      ? {
          customer: { ...blankCustomer(), ...initial.customerSnapshot },
          customerId: initial.customerId ?? "",
          customerEdited: false,
          customerSelected: false,
          issueDate: initial.issueDate,
          lines: initial.lines.map((line) => ({
            description: line.description,
            discountAmount: line.discountAmount,
            name: line.name,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          })),
          notes: initial.notes,
          terms: initial.terms,
          validUntil: initial.validUntil,
        }
      : { ...blankQuote(), customerEdited: false, customerSelected: false },
  );
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const currentTotals = useMemo(() => totals(form.lines), [form.lines]);
  function updateLine(index: number, key: keyof Line, value: string | number) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [key]: value } : line,
      ),
    }));
  }
  function chooseCustomer(id: string) {
    const customer = customers.find((candidate) => candidate.id === id);
    setForm((current) => ({
      ...current,
      customer: customer ?? blankCustomer(),
      customerId: id,
      customerEdited: false,
      customerSelected: Boolean(id),
    }));
  }
  async function quickCustomer() {
    if (!form.customer.name.trim()) {
      setMessage("請先輸入客戶名稱，才可快速新增。 ");
      return;
    }
    try {
      const customerInput = {
        address: form.customer.address,
        businessRegistration: form.customer.businessRegistration,
        companyName: form.customer.companyName,
        contact: form.customer.contact,
        email: form.customer.email,
        name: form.customer.name,
        notes: form.customer.notes,
        phone: form.customer.phone,
      };
      const customer = await onQuickCustomer(customerInput);
      setForm((current) => ({
        ...current,
        customer,
        customerId: customer.id,
        customerEdited: false,
        customerSelected: true,
      }));
      setMessage("已新增並選取此客戶。 ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法新增客戶。 ");
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    if (
      !form.customer.name.trim() ||
      !form.issueDate ||
      !form.validUntil ||
      !form.lines.length ||
      form.lines.some(
        (line) =>
          !line.name.trim() ||
          line.quantity <= 0 ||
          line.unitPrice < 0 ||
          line.discountAmount < 0,
      )
    ) {
      setMessage("請填妥客戶、日期與每個品項的名稱、數量及金額。 ");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const customer = {
        address: form.customer.address,
        businessRegistration: form.customer.businessRegistration,
        companyName: form.customer.companyName,
        contact: form.customer.contact,
        email: form.customer.email,
        name: form.customer.name,
        notes: form.customer.notes,
        phone: form.customer.phone,
      };
      const payload = {
        ...form,
        customer,
        customerId: form.customerId || undefined,
        lines: form.lines.map((line) => ({
          ...line,
          name: line.name.trim(),
          description: line.description.trim(),
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          discountAmount: Number(line.discountAmount),
        })),
      };
      const data = initial
        ? await request<{ quote: Quote }>(`/api/quotes/${initial.id}`, {
            body: JSON.stringify(payload),
            method: "PUT",
          })
        : await request<{ quote: Quote }>("/api/quotes", {
            body: JSON.stringify(payload),
            method: "POST",
          });
      onSaved(data.quote);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法儲存報價單。 ");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="page-view quotation-editor no-print">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{initial ? "EDIT DRAFT" : "NEW QUOTATION"}</p>
          <h2>{initial ? `編輯 ${initial.quoteNumber}` : "建立報價單"}</h2>
          <p>只有草稿可編輯；所有公司、客戶與品項資料會在儲存時建立快照。</p>
        </div>
        <button className="reset-button" type="button" onClick={onCancel}>
          返回列表
        </button>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset className="form-section">
          <legend>客戶資料</legend>
          <div className="field-grid">
            <label className="field full-span">
              <span>帶入既有客戶</span>
              <select
                value={form.customerId}
                onChange={(event) => chooseCustomer(event.target.value)}
              >
                <option value="">手動輸入客戶</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                    {customer.contact ? ` · ${customer.contact}` : ""}
                  </option>
                ))}
              </select>
              <FieldHelp>選擇既有客戶會帶入其資料；手動修改後可另存為新的客戶主檔。</FieldHelp>
            </label>
            <QuoteField
              label="公司名稱或客戶姓名"
              required
              value={form.customer.name}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  customer: { ...current.customer, name: value },
                  customerId: "",
                  customerEdited: true,
                  customerSelected: false,
                }))
              }
            />
            <QuoteField
              label="公司名稱"
              value={form.customer.companyName}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  customer: { ...current.customer, companyName: value },
                  customerId: "",
                  customerEdited: true,
                  customerSelected: false,
                }))
              }
            />
            <QuoteField
              label="聯絡人"
              value={form.customer.contact}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  customer: { ...current.customer, contact: value },
                  customerId: "",
                  customerEdited: true,
                  customerSelected: false,
                }))
              }
            />
            <QuoteField
              label="電話"
              value={form.customer.phone}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  customer: { ...current.customer, phone: value },
                  customerId: "",
                  customerEdited: true,
                  customerSelected: false,
                }))
              }
            />
            <QuoteField
              label="電郵"
              type="email"
              value={form.customer.email}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  customer: { ...current.customer, email: value },
                  customerId: "",
                  customerEdited: true,
                  customerSelected: false,
                }))
              }
            />
            <QuoteField
              label="商業登記號碼／統編"
              value={form.customer.businessRegistration}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  customer: {
                    ...current.customer,
                    businessRegistration: value,
                  },
                  customerId: "",
                  customerEdited: true,
                  customerSelected: false,
                }))
              }
            />
            <QuoteField
              className="full-span"
              label="地址"
              value={form.customer.address}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  customer: { ...current.customer, address: value },
                  customerId: "",
                  customerEdited: true,
                  customerSelected: false,
                }))
              }
            />
            <QuoteField
              className="full-span"
              label="備註"
              value={form.customer.notes}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  customer: { ...current.customer, notes: value },
                  customerId: "",
                  customerEdited: true,
                  customerSelected: false,
                }))
              }
            />
          </div>
          {canManage && !form.customerId && (
            <button
              className="text-button quotation-inline-action"
              type="button"
              onClick={() => void quickCustomer()}
            >
              將目前資料快速新增為客戶
            </button>
          )}
        </fieldset>
        <fieldset className="form-section">
          <legend>報價資料</legend>
          <div className="field-grid">
            <QuoteField
              label="開立日期"
              required
              type="date"
              value={form.issueDate}
              onChange={(value) =>
                setForm((current) => ({ ...current, issueDate: value }))
              }
            />
            <QuoteField
              label="有效期限"
              required
              type="date"
              value={form.validUntil}
              onChange={(value) =>
                setForm((current) => ({ ...current, validUntil: value }))
              }
            />
            <p className="field-hint full-span">過了有效期限的報價單會顯示為已失效，不能再用來建立請款單。</p>
          </div>
        </fieldset>
        <fieldset className="form-section">
          <div className="quotation-line-heading">
            <legend>品項明細</legend>
            {canManage && (
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    lines: [...current.lines, blankLine()],
                  }))
                }
              >
                <Plus size={14} />
                新增列
              </button>
            )}
          </div>
          <div className="quote-lines">
            {form.lines.map((line, index) => (
              <div className="quote-line-editor" key={index}>
                <div className="quote-line-main">
                  <label className="field">
                    <span>常用品項</span>
                    <select
                      value=""
                      onChange={(event) => {
                        const item = items.find(
                          (value) => value.id === event.target.value,
                        );
                        if (item)
                          setForm((current) => ({
                            ...current,
                            lines: current.lines.map((value, itemIndex) =>
                              itemIndex === index
                                ? {
                                    description: item.description,
                                    discountAmount: 0,
                                    name: item.name,
                                    quantity: value.quantity || 1,
                                    unitPrice: item.unitPrice,
                                  }
                                : value,
                            ),
                          }));
                      }}
                    >
                      <option value="">手動輸入或選擇品項</option>
                      {items
                        .filter((item) => item.isActive)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                            {item.sku ? ` (${item.sku})` : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                  <QuoteField
                    label="名稱"
                    required
                    value={line.name}
                    onChange={(value) => updateLine(index, "name", value)}
                  />
                  <QuoteField
                    label="描述"
                    value={line.description}
                    onChange={(value) =>
                      updateLine(index, "description", value)
                    }
                  />
                  <QuoteField
                    label="數量"
                    required
                    min="0.001"
                    step="0.001"
                    type="number"
                    value={String(line.quantity)}
                    onChange={(value) =>
                      updateLine(index, "quantity", Number(value))
                    }
                  />
                  <QuoteField
                    label="單價（HKD）"
                    required
                    min="0"
                    step="0.01"
                    type="number"
                    value={String(line.unitPrice)}
                    onChange={(value) =>
                      updateLine(index, "unitPrice", Number(value))
                    }
                  />
                  <QuoteField
                    label="折扣金額（HKD）"
                    min="0"
                    step="0.01"
                    type="number"
                    value={String(line.discountAmount)}
                    onChange={(value) =>
                      updateLine(index, "discountAmount", Number(value))
                    }
                  />
                  {index === 0 && <p className="field-hint full-span">折扣為單一品項的固定金額；小計會自動以數量 × 單價 − 折扣計算。</p>}
                  <output className="quote-line-subtotal">
                    小計 HKD {money(lineTotal(line))}
                  </output>
                </div>
                <div className="quote-line-actions">
                  {canManage && (
                    <>
                      <button
                        aria-label="上移品項"
                        disabled={index === 0}
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            lines: current.lines.map(
                              (value, itemIndex, values) =>
                                itemIndex === index
                                  ? values[index - 1]
                                  : itemIndex === index - 1
                                    ? values[index]
                                    : value,
                            ),
                          }))
                        }
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        aria-label="下移品項"
                        disabled={index === form.lines.length - 1}
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            lines: current.lines.map(
                              (value, itemIndex, values) =>
                                itemIndex === index
                                  ? values[index + 1]
                                  : itemIndex === index + 1
                                    ? values[index]
                                    : value,
                            ),
                          }))
                        }
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        aria-label="刪除品項"
                        disabled={form.lines.length === 1}
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            lines: current.lines.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          }))
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="quote-totals-editor">
            <span>總折扣 HKD {money(currentTotals.discount)}</span>
            <strong>總金額 HKD {money(currentTotals.amount)}</strong>
          </div>
        </fieldset>
        <fieldset className="form-section">
          <legend>備註與條款</legend>
          <div className="field-grid">
            <QuoteArea
              label="備註"
              value={form.notes}
              onChange={(value) =>
                setForm((current) => ({ ...current, notes: value }))
              }
            />
            <QuoteArea
              label="報價條款"
              value={form.terms}
              onChange={(value) =>
                setForm((current) => ({ ...current, terms: value }))
              }
            />
          </div>
        </fieldset>
        {message && <p className="validation-message">{message}</p>}
        <button
          className="primary-action"
          disabled={!canManage || saving}
          type="submit"
        >
          <Save size={17} />
          {saving ? "儲存中…" : "儲存草稿報價單"}
        </button>
      </form>
    </section>
  );
}

function QuoteDetail({
  canManage,
  message,
  onBack,
  onCreateInvoice,
  onDuplicate,
  onEdit,
  onOpenReceipts,
  onOpenInvoices,
  onStatus,
  quote,
  receipt,
  invoice,
}: {
  canManage: boolean;
  message: string;
  onBack: () => void;
  onCreateInvoice: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onOpenReceipts: () => void;
  onOpenInvoices: () => void;
  onStatus: (status: "sent" | "accepted" | "rejected") => void;
  quote: Quote;
  receipt: ReceiptLink;
  invoice: InvoiceLink;
}) {
  return (
    <section className="page-view quote-detail">
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">QUOTATION DETAIL</p>
          <h2>{quote.quoteNumber}</h2>
          <p>
            狀態：
            <em className={`quote-status ${quote.status}`}>
              {statusText(quote.status)}
            </em>
            　有效至 {quote.validUntil}
          </p>
        </div>
        <div className="quote-detail-actions">
          <button className="text-button" type="button" onClick={onBack}>
            返回列表
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => window.print()}
          >
            <FileDown size={14} />
            列印／輸出 PDF
          </button>
          <button className="text-button" type="button" onClick={onDuplicate}>
            <Copy size={14} />
            複製
          </button>
          {canManage && quote.status === "draft" && (
            <button className="text-button" type="button" onClick={onEdit}>
              <Pencil size={14} />
              編輯草稿
            </button>
          )}
        </div>
      </div>
      {canManage && (
        <div className="quote-workflow-actions no-print">
          {quote.status === "draft" && (
            <button
              className="secondary-action"
              type="button"
              onClick={() => onStatus("sent")}
            >
              標示為已發送
            </button>
          )}
          {quote.status === "sent" && (
            <>
              <button
                className="secondary-action"
                type="button"
                onClick={() => onStatus("accepted")}
              >
                <Check size={15} />
                客戶已接受
              </button>
              <button
                className="secondary-action danger-action"
                type="button"
                onClick={() => onStatus("rejected")}
              >
                客戶已拒絕
              </button>
            </>
          )}
          {quote.status === "accepted" && !invoice && (
            <button
              className="primary-action quote-receipt-action"
              type="button"
              onClick={onCreateInvoice}
            >
              轉為請款單
            </button>
          )}
          {invoice && <button className="secondary-action quote-receipt-action" type="button" onClick={onOpenInvoices}>已建立請款單：{invoice.invoiceNumber}</button>}
          {receipt && (
            <button
              className="secondary-action quote-receipt-action"
              type="button"
              onClick={onOpenReceipts}
            >
              關聯收據：{receipt.receiptNumber}（
              {receipt.paymentStatus === "paid" ? "已收款" : "待收款"}）
            </button>
          )}
        </div>
      )}
      {message && <p className="save-message no-print">{message}</p>}
      <QuotePaper quote={quote} />
    </section>
  );
}

function QuotePaper({ quote }: { quote: Quote }) {
  return (
    <article className="quote-paper" aria-label="報價單列印預覽">
      <header className="quote-paper-header">
        <div>
          <h3>{quote.companySnapshot.name}</h3>
          {quote.companySnapshot.address && (
            <p>{quote.companySnapshot.address}</p>
          )}
          {quote.companySnapshot.businessRegistration && (
            <p>商業登記號碼：{quote.companySnapshot.businessRegistration}</p>
          )}
          {[quote.companySnapshot.phone, quote.companySnapshot.email]
            .filter(Boolean)
            .join(" · ") && (
            <p>
              {[quote.companySnapshot.phone, quote.companySnapshot.email]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        <div>
          <h1>
            報價單 <small>/ QUOTATION</small>
          </h1>
          <dl>
            <div>
              <dt>報價單號</dt>
              <dd>{quote.quoteNumber}</dd>
            </div>
            <div>
              <dt>開立日期</dt>
              <dd>{quote.issueDate}</dd>
            </div>
            <div>
              <dt>有效期限</dt>
              <dd>{quote.validUntil}</dd>
            </div>
          </dl>
        </div>
      </header>
      <section className="quote-bill-to">
        <span>客戶資料</span>
        <strong>{quote.customerSnapshot.name}</strong>
        {quote.customerSnapshot.contact && (
          <p>聯絡人：{quote.customerSnapshot.contact}</p>
        )}
        {quote.customerSnapshot.address && (
          <p>{quote.customerSnapshot.address}</p>
        )}
        {[quote.customerSnapshot.phone, quote.customerSnapshot.email]
          .filter(Boolean)
          .join(" · ") && (
          <p>
            {[quote.customerSnapshot.phone, quote.customerSnapshot.email]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </section>
      <table className="quote-paper-table">
        <thead>
          <tr>
            <th>項目／服務</th>
            <th>數量</th>
            <th>單價（HKD）</th>
            <th>折扣</th>
            <th>小計（HKD）</th>
          </tr>
        </thead>
        <tbody>
          {quote.lines.map((line, index) => (
            <tr key={index}>
              <td>
                <strong>{line.name}</strong>
                {line.description && <small>{line.description}</small>}
              </td>
              <td>{line.quantity}</td>
              <td>{money(line.unitPrice)}</td>
              <td>{money(line.discountAmount)}</td>
              <td>{money(line.subtotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>總折扣</td>
            <td>{money(quote.totalDiscount)}</td>
          </tr>
          <tr>
            <td colSpan={4}>總金額（HKD）</td>
            <td>HKD {money(quote.totalAmount)}</td>
          </tr>
        </tfoot>
      </table>
      {quote.notes && (
        <section className="quote-paper-notes">
          <strong>備註</strong>
          <p>{quote.notes}</p>
        </section>
      )}
      {quote.terms && (
        <section className="quote-paper-notes">
          <strong>報價條款</strong>
          <p>{quote.terms}</p>
        </section>
      )}
      {quote.companySnapshot.bankDetails && (
        <section className="quote-paper-notes">
          <strong>收款銀行資料</strong>
          <p>{quote.companySnapshot.bankDetails}</p>
        </section>
      )}
      <p className="quote-disclaimer">本文件為報價單，並非付款收據。</p>
    </article>
  );
}

function CustomerManager({
  canManage,
  message,
  onBack,
  onChanged,
  onOpenQuote,
}: {
  canManage: boolean;
  message: string;
  onBack: () => void;
  onChanged: () => void;
  onOpenQuote: (id: string) => void;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState(blankCustomer);
  const [editing, setEditing] = useState("");
  const [localMessage, setLocalMessage] = useState(message);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [detail, setDetail] = useState<{
    customer: Customer;
    quotations: Array<{
      id: string;
      issueDate: string;
      quoteNumber: string;
      status: string;
      totalAmount: number;
    }>;
  } | null>(null);
  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ status });
      if (query.trim()) params.set("q", query.trim());
      const data = await request<{ customers: Customer[] }>(
        `/api/customers?${params}`,
      );
      setCustomers(data.customers ?? []);
    } catch (error) {
      setLocalMessage(
        error instanceof Error ? error.message : "無法讀取客戶。",
      );
    }
  }, [query, status]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      setLocalMessage("請輸入客戶名稱。");
      return;
    }
    try {
      await request(editing ? `/api/customers/${editing}` : "/api/customers", {
        body: JSON.stringify(form),
        method: editing ? "PUT" : "POST",
      });
      setForm(blankCustomer());
      setEditing("");
      await load();
      onChanged();
    } catch (error) {
      setLocalMessage(
        error instanceof Error ? error.message : "無法儲存客戶。",
      );
    }
  }
  async function remove(id: string) {
    if (
      !window.confirm(
        "確定封存此客戶？\n封存後不會出現在新報價單的客戶選單，但歷史報價單不受影響。",
      )
    )
      return;
    try {
      await request(`/api/customers/${id}`, {
        body: JSON.stringify({ status: "archived" }),
        method: "PATCH",
      });
      await load();
      onChanged();
    } catch (error) {
      setLocalMessage(
        error instanceof Error ? error.message : "無法封存客戶。",
      );
    }
  }
  async function reactivate(id: string) {
    try {
      await request(`/api/customers/${id}`, {
        body: JSON.stringify({ status: "active" }),
        method: "PATCH",
      });
      await load();
      onChanged();
    } catch (error) {
      setLocalMessage(
        error instanceof Error ? error.message : "無法重新啟用客戶。",
      );
    }
  }
  async function openDetail(id: string) {
    try {
      setDetail(await request(`/api/customers/${id}`));
    } catch (error) {
      setLocalMessage(
        error instanceof Error ? error.message : "無法讀取客戶詳情。",
      );
    }
  }
  if (detail)
    return (
      <section className="page-view quotation-management no-print">
        <div className="page-heading">
          <div>
            <p className="eyebrow">CUSTOMER DETAIL</p>
            <h2>{detail.customer.name}</h2>
            <p>客戶主檔為目前工作區共用；歷史報價單保留其快照。</p>
          </div>
          <button
            className="reset-button"
            type="button"
            onClick={() => setDetail(null)}
          >
            返回客戶列表
          </button>
        </div>
        <section className="quote-paper-notes">
          <strong>客戶資料</strong>
          <p>公司名稱：{detail.customer.companyName || "—"}</p>
          <p>聯絡人：{detail.customer.contact || "—"}</p>
          <p>電話：{detail.customer.phone || "—"}</p>
          <p>Email：{detail.customer.email || "—"}</p>
          <p>地址：{detail.customer.address || "—"}</p>
          <p>
            商業登記號碼／統編：{detail.customer.businessRegistration || "—"}
          </p>
          <p>備註：{detail.customer.notes || "—"}</p>
          <p>
            狀態：{detail.customer.status === "archived" ? "已封存" : "啟用中"}
          </p>
          <p>
            建立時間：
            {detail.customer.createdAt
              ? new Date(detail.customer.createdAt).toLocaleString()
              : "—"}
          </p>
          <p>
            更新時間：
            {detail.customer.updatedAt
              ? new Date(detail.customer.updatedAt).toLocaleString()
              : "—"}
          </p>
        </section>
        <h3>關聯報價單</h3>
        <div className="master-list">
          {detail.quotations.length ? (
            detail.quotations.map((quote) => (
              <article key={quote.id}>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => onOpenQuote(quote.id)}
                >
                  {quote.quoteNumber}
                </button>
                <span>
                  {quote.issueDate} · {quote.status} · HKD{" "}
                  {money(quote.totalAmount)}
                </span>
              </article>
            ))
          ) : (
            <p>尚未有關聯報價單。</p>
          )}
        </div>
      </section>
    );
  return (
    <section className="page-view quotation-management no-print">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CUSTOMER DIRECTORY</p>
          <h2>客戶主檔</h2>
          <p>客戶資料由目前工作區共用；已開立報價單會保留自己的快照。</p>
        </div>
        <button className="reset-button" type="button" onClick={onBack}>
          返回報價單
        </button>
      </div>
      <div className="quotation-tools">
        <label className="field">
          <span>搜尋</span>
          <input
            placeholder="名稱、公司、聯絡人、電郵或電話"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="field">
          <span>狀態</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="active">啟用中</option>
            <option value="archived">已封存</option>
            <option value="all">全部</option>
          </select>
        </label>
      </div>
      {canManage && (
        <form
          className="quotation-master-form"
          onSubmit={(event) => void save(event)}
        >
          <div className="field-grid">
            <QuoteField
              label="客戶顯示名稱"
              required
              value={form.name}
              onChange={(value) =>
                setForm((current) => ({ ...current, name: value }))
              }
            />
            <QuoteField
              label="公司名稱"
              value={form.companyName}
              onChange={(value) =>
                setForm((current) => ({ ...current, companyName: value }))
              }
            />
            <QuoteField
              label="聯絡人"
              value={form.contact}
              onChange={(value) =>
                setForm((current) => ({ ...current, contact: value }))
              }
            />
            <QuoteField
              label="電話"
              value={form.phone}
              onChange={(value) =>
                setForm((current) => ({ ...current, phone: value }))
              }
            />
            <QuoteField
              label="電郵"
              value={form.email}
              onChange={(value) =>
                setForm((current) => ({ ...current, email: value }))
              }
            />
            <QuoteField
              label="商業登記號碼／統編"
              value={form.businessRegistration}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  businessRegistration: value,
                }))
              }
            />
            <QuoteField
              className="full-span"
              label="地址"
              value={form.address}
              onChange={(value) =>
                setForm((current) => ({ ...current, address: value }))
              }
            />
            <QuoteArea
              label="備註"
              value={form.notes}
              onChange={(value) =>
                setForm((current) => ({ ...current, notes: value }))
              }
            />
          </div>
          <div className="master-form-actions">
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setForm(blankCustomer());
                setEditing("");
              }}
            >
              清除
            </button>
            <button className="page-primary-action" type="submit">
              {editing ? "更新客戶" : "新增客戶"}
            </button>
          </div>
        </form>
      )}
      {localMessage && <p className="save-message">{localMessage}</p>}
      <div className="master-list">
        {customers.length ? customers.map((customer) => (
          <article key={customer.id}>
            <div>
              <button
                className="text-button"
                type="button"
                onClick={() => void openDetail(customer.id)}
              >
                <strong>{customer.name}</strong>
              </button>
              <span>
                {[
                  customer.companyName,
                  customer.contact,
                  customer.phone,
                  customer.email,
                ]
                  .filter(Boolean)
                  .join(" · ") || "未填聯絡資料"}{" "}
                · {customer.status === "archived" ? "已封存" : "啟用中"}
              </span>
            </div>
            {canManage && (
              <div>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setForm(customer);
                    setEditing(customer.id);
                  }}
                >
                  編輯
                </button>
                {customer.status === "archived" ? (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => void reactivate(customer.id)}
                  >
                    重新啟用
                  </button>
                ) : (
                  <button
                    className="text-button danger-text"
                    type="button"
                    onClick={() => void remove(customer.id)}
                  >
                    封存
                  </button>
                )}
              </div>
            )}
          </article>
        )) : <div className="empty-receipts"><h3>目前還沒有建立任何客戶</h3><p>{canManage ? "先建立客戶主檔，之後開立報價單時即可快速帶入聯絡資料。" : "目前沒有可查看的客戶資料。"}</p></div>}
      </div>
    </section>
  );
}

function ItemManager({
  canManage,
  items,
  message,
  onBack,
  onChanged,
}: {
  canManage: boolean;
  items: Item[];
  message: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [form, setForm] = useState(blankItem);
  const [editing, setEditing] = useState("");
  const [localMessage, setLocalMessage] = useState(message);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (
      !form.name.trim() ||
      !Number.isFinite(form.unitPrice) ||
      form.unitPrice < 0
    ) {
      setLocalMessage("請輸入品項名稱及有效單價。");
      return;
    }
    try {
      await request(editing ? `/api/items/${editing}` : "/api/items", {
        body: JSON.stringify({ ...form, unitPrice: Number(form.unitPrice) }),
        method: editing ? "PUT" : "POST",
      });
      setForm(blankItem());
      setEditing("");
      onChanged();
    } catch (error) {
      setLocalMessage(
        error instanceof Error ? error.message : "無法儲存品項。",
      );
    }
  }
  async function remove(id: string) {
    if (!window.confirm("確定要刪除此品項？\n刪除後無法再從新報價單帶入；既有報價單仍會保留當時的品項快照。")) return;
    try {
      await request(`/api/items/${id}`, { method: "DELETE" });
      onChanged();
    } catch (error) {
      setLocalMessage(
        error instanceof Error ? error.message : "無法刪除品項。",
      );
    }
  }
  return (
    <section className="page-view quotation-management no-print">
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMMON ITEMS</p>
          <h2>常用品項</h2>
          <p>用來加快報價開立，不包含庫存或扣減。</p>
        </div>
        <button className="reset-button" type="button" onClick={onBack}>
          返回報價單
        </button>
      </div>
      {canManage && (
        <form
          className="quotation-master-form"
          onSubmit={(event) => void save(event)}
        >
          <div className="field-grid">
            <QuoteField
              label="品項／服務名稱"
              required
              value={form.name}
              onChange={(value) =>
                setForm((current) => ({ ...current, name: value }))
              }
            />
            <QuoteField
              label="預設單價（HKD）"
              required
              min="0"
              step="0.01"
              type="number"
              value={String(form.unitPrice)}
              onChange={(value) =>
                setForm((current) => ({ ...current, unitPrice: Number(value) }))
              }
            />
            <QuoteField
              label="SKU／內部編號"
              value={form.sku}
              onChange={(value) =>
                setForm((current) => ({ ...current, sku: value }))
              }
            />
            <label className="field">
              <span>狀態</span>
              <select
                value={String(form.isActive)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    isActive: event.target.value === "true",
                  }))
                }
              >
                <option value="true">啟用</option>
                <option value="false">停用</option>
              </select>
            </label>
            <QuoteArea
              label="描述（選填）"
              value={form.description}
              onChange={(value) =>
                setForm((current) => ({ ...current, description: value }))
              }
            />
          </div>
          <p className="field-hint">預設單價只會在帶入報價單時使用；停用品項會保留歷史資料，但不會出現在新報價單的選單。</p>
          <div className="master-form-actions">
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setForm(blankItem());
                setEditing("");
              }}
            >
              清除
            </button>
            <button className="page-primary-action" type="submit">
              {editing ? "更新品項" : "新增品項"}
            </button>
          </div>
        </form>
      )}
      {localMessage && <p className="save-message">{localMessage}</p>}
      {!items.length && canManage && <FirstUseGuide title="第一次建立常用品項？" steps={["輸入商品或服務名稱與預設單價", "需要辨識時加上 SKU／內部編號", "啟用品項後，可在報價單明細中快速帶入"]} />}
      <div className="master-list">
        {items.length ? items.map((item) => (
          <article key={item.id}>
            <div>
              <strong>
                {item.name}{" "}
                {!item.isActive && (
                  <em className="quote-status rejected">已停用</em>
                )}
              </strong>
              <span>
                {[item.sku, item.description, `HKD ${money(item.unitPrice)}`]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            {canManage && (
              <div>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setForm(item);
                    setEditing(item.id);
                  }}
                >
                  編輯
                </button>
                <button
                  className="text-button danger-text"
                  type="button"
                  onClick={() => void remove(item.id)}
                >
                  刪除
                </button>
              </div>
            )}
          </article>
        )) : <div className="empty-receipts"><h3>目前還沒有建立任何常用品項</h3><p>{canManage ? "建立常用商品或服務，開立報價單時可帶入名稱、描述與預設單價。" : "目前沒有可查看的常用品項。"}</p></div>}
      </div>
    </section>
  );
}

function CompanyEditor({
  canManage,
  initial,
  message,
  onBack,
  onSaved,
}: {
  canManage: boolean;
  initial: Organization;
  message: string;
  onBack: () => void;
  onSaved: (organization: Organization) => void;
}) {
  const [form, setForm] = useState(initial);
  const [localMessage, setLocalMessage] = useState(message);
  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      const data = await request<{ organization: Organization }>(
        "/api/organization/profile",
        { body: JSON.stringify(form), method: "PUT" },
      );
      onSaved(data.organization);
    } catch (error) {
      setLocalMessage(
        error instanceof Error ? error.message : "無法儲存公司資料。",
      );
    }
  }
  return (
    <section className="page-view quotation-management no-print">
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMPANY PROFILE</p>
          <h2>公司基本資料</h2>
          <p>此資料會自動帶入新報價單，並於開立時儲存快照。</p>
        </div>
        <button className="reset-button" type="button" onClick={onBack}>
          返回報價單
        </button>
      </div>
      {canManage ? (
        <form
          className="quotation-master-form"
          onSubmit={(event) => void save(event)}
        >
          <div className="field-grid">
            <QuoteField
              label="公司／商號名稱"
              required
              value={form.name}
              onChange={(value) =>
                setForm((current) => ({ ...current, name: value }))
              }
            />
            <QuoteField
              label="商業登記號碼"
              value={form.businessRegistration}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  businessRegistration: value,
                }))
              }
            />
            <QuoteField
              label="聯絡電話"
              value={form.phone}
              onChange={(value) =>
                setForm((current) => ({ ...current, phone: value }))
              }
            />
            <QuoteField
              label="電郵"
              type="email"
              value={form.email}
              onChange={(value) =>
                setForm((current) => ({ ...current, email: value }))
              }
            />
            <QuoteField
              className="full-span"
              label="地址"
              value={form.address}
              onChange={(value) =>
                setForm((current) => ({ ...current, address: value }))
              }
            />
            <QuoteArea
              label="收款銀行資料（選填）"
              value={form.bankDetails}
              onChange={(value) =>
                setForm((current) => ({ ...current, bankDetails: value }))
              }
            />
          </div>
          <p className="field-hint">這份資料會帶入日後新開立的報價單；已儲存的歷史報價單不會被改動。</p>
          <button className="primary-action" type="submit">
            儲存公司資料
          </button>
        </form>
      ) : (
        <p className="ledger-read-only">你沒有修改公司資料的權限。</p>
      )}
      {localMessage && <p className="save-message">{localMessage}</p>}
    </section>
  );
}

function QuoteField({
  className = "",
  label,
  required,
  type = "text",
  value,
  onChange,
  min,
  step,
}: {
  className?: string;
  label: string;
  required?: boolean;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  step?: string;
}) {
  return (
    <label className={`field ${className}`}>
      <span>
        {label}
        {required && <b> *</b>}
      </span>
      <input
        min={min}
        required={required}
        step={step}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function QuoteArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        className="quotation-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
