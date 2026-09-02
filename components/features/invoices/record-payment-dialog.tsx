"use client";

import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/app/button";
import { Modal } from "@/components/app/dialog";
import { Field, FormError, FormGrid, FormSection, TextareaField } from "@/components/app/form";
import { SummaryList } from "@/components/app/surfaces";
import { notify } from "@/components/app/toast";
import { request } from "@/lib/api";
import { currencyAmount, today } from "@/lib/format";
import type { Invoice } from "@/types/records";

const TODAY = today();

/**
 * Records one instalment against an invoice. The dialog always shows the three
 * numbers that matter — billed, collected, outstanding — so the amount being
 * entered can be checked against them before saving.
 */
export function RecordPaymentDialog({
  currency,
  invoice,
  onClose,
  onRecorded,
  open,
}: {
  currency: string;
  invoice: Invoice;
  onClose: () => void;
  onRecorded: (invoice: Invoice) => void;
  open: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(TODAY);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      // Pre-filled with everything still owed, which is the common case.
      setAmount(invoice.outstandingAmount > 0 ? String(invoice.outstandingAmount) : "");
      setPaidAt(TODAY);
      setPaymentMethod("");
      setReference("");
      setNote("");
      setErrors({});
      setMessage("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [invoice.outstandingAmount, open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    const value = Number(amount);
    if (!amount.trim()) found.amount = "請輸入這次收到的金額。";
    else if (!Number.isFinite(value) || value <= 0) found.amount = "收款金額必須大於 0。";
    else if (value > invoice.outstandingAmount)
      found.amount = `收款金額不可超過尚未收款的 ${currencyAmount(currency, invoice.outstandingAmount)}。`;
    if (!paidAt) found.paidAt = "請選擇收到款項的日期。";
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    setMessage("");
    try {
      const data = await request<{ invoice: Invoice }>(`/api/invoices/${invoice.id}/payments`, {
        body: JSON.stringify({ amount: value, note, paidAt, paymentMethod, reference }),
        method: "POST",
      });
      notify.success(
        `已登記收款 ${currencyAmount(currency, value)}`,
        data.invoice.paymentStatus === "paid"
          ? `${invoice.invoiceNumber} 的款項已全數收妥。`
          : `${invoice.invoiceNumber} 還有 ${currencyAmount(currency, data.invoice.outstandingAmount)} 尚未收款。`,
      );
      onRecorded(data.invoice);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法登記收款，請稍後再試一次。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      description="每次收到款項就登記一筆，狀態會依已收金額自動更新為部分付款或已付款。"
      footer={
        <>
          <Button onClick={onClose} variant="ghost">
            取消
          </Button>
          <Button form="record-payment-form" pending={saving} pendingLabel="登記中…" type="submit" variant="primary">
            登記這筆收款
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title={`登記 ${invoice.invoiceNumber} 的收款`}
    >
      <SummaryList
        items={[
          { label: "請款總額", value: currencyAmount(currency, invoice.totalAmount) },
          { label: "已收金額", value: currencyAmount(currency, invoice.paidAmount) },
          { label: "尚未收款", value: currencyAmount(currency, invoice.outstandingAmount) },
        ]}
      />

      <form className="form" id="record-payment-form" onSubmit={(event) => void submit(event)}>
        <FormSection title="這次收到多少？">
          <FormGrid>
            <Field
              error={errors.amount}
              hint={`最多 ${currencyAmount(currency, invoice.outstandingAmount)}。`}
              inputMode="decimal"
              label={`本次收到金額（${currency}）`}
              min="0.01"
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              required
              step="0.01"
              type="number"
              value={amount}
            />
            <Field
              error={errors.paidAt}
              hint="以款項實際入帳的日期為準。"
              label="收款日期"
              onChange={(event) => setPaidAt(event.target.value)}
              required
              type="date"
              value={paidAt}
            />
            <Field
              hint="會印在之後開立的收據上。"
              label="付款方式"
              onChange={(event) => setPaymentMethod(event.target.value)}
              placeholder="銀行轉帳"
              value={paymentMethod}
            />
            <Field
              hint="銀行參考編號、支票號碼或交易編號。"
              label="參考編號"
              onChange={(event) => setReference(event.target.value)}
              placeholder="選填"
              value={reference}
            />
            <TextareaField
              hint="例如：訂金、尾款。只有你的團隊看得到，不會印在收據上。"
              label="備註"
              onChange={(event) => setNote(event.target.value)}
              placeholder="訂金"
              rows={2}
              span
              value={note}
            />
          </FormGrid>
        </FormSection>
        <FormError>{message}</FormError>
      </form>
    </Modal>
  );
}
