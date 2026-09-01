"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/app/button";
import { Field, FormGrid, SelectField } from "@/components/app/form";
import { currencyAmount, money } from "@/lib/format";
import type { DocumentLine, Item } from "@/types/records";

/**
 * Shared by the quotation and invoice editors. Amounts are held as strings while
 * editing so clearing a field does not silently become 0, and each row is a card
 * with its own subtotal — on a phone the old flat stack of inputs made it
 * impossible to tell where one line ended and the next began.
 */
export type EditableLine = {
  description: string;
  discountAmount: string;
  name: string;
  quantity: string;
  unitPrice: string;
};

export type LineErrors = Record<string, string>;

export const blankEditableLine = (): EditableLine => ({
  description: "",
  discountAmount: "0",
  name: "",
  quantity: "1",
  unitPrice: "0",
});

export function toEditableLines(lines: DocumentLine[]): EditableLine[] {
  return lines.length
    ? lines.map((line) => ({
        description: line.description ?? "",
        discountAmount: String(line.discountAmount ?? 0),
        name: line.name,
        quantity: String(line.quantity),
        unitPrice: String(line.unitPrice),
      }))
    : [blankEditableLine()];
}

/** The API's line schema is strict: `subtotal` must not be sent back. */
export function toLinePayload(lines: EditableLine[]) {
  return lines.map((line) => ({
    description: line.description.trim(),
    discountAmount: Number(line.discountAmount || 0),
    name: line.name.trim(),
    quantity: Number(line.quantity || 0),
    unitPrice: Number(line.unitPrice || 0),
  }));
}

function lineSubtotal(line: EditableLine) {
  const value = Number(line.unitPrice || 0) * Number(line.quantity || 0) - Number(line.discountAmount || 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function lineTotals(lines: EditableLine[]) {
  return {
    amount: lines.reduce((sum, line) => sum + lineSubtotal(line), 0),
    discount: lines.reduce((sum, line) => sum + Number(line.discountAmount || 0), 0),
  };
}

export function validateLines(lines: EditableLine[]) {
  return lines.map((line) => {
    const errors: LineErrors = {};
    if (!line.name.trim()) errors.name = "請輸入品項名稱。";
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) errors.quantity = "數量必須大於 0。";
    const unitPrice = Number(line.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) errors.unitPrice = "單價必須是 0 或以上。";
    const discount = Number(line.discountAmount || 0);
    if (!Number.isFinite(discount) || discount < 0) errors.discountAmount = "折扣必須是 0 或以上。";
    else if (Number.isFinite(unitPrice) && Number.isFinite(quantity) && discount > unitPrice * quantity)
      errors.discountAmount = "折扣不可以大於數量 × 單價。";
    return errors;
  });
}

export function LineItemsEditor({
  currency,
  errors,
  items,
  lines,
  onChange,
  readOnly,
}: {
  currency: string;
  errors?: LineErrors[];
  /** Saved products and services offered in the picker. */
  items?: Item[];
  lines: EditableLine[];
  onChange: (lines: EditableLine[]) => void;
  readOnly?: boolean;
}) {
  const totals = lineTotals(lines);
  const activeItems = (items ?? []).filter((item) => item.isActive);

  function update(index: number, patch: Partial<EditableLine>) {
    onChange(lines.map((line, position) => (position === index ? { ...line, ...patch } : line)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= lines.length) return;
    const next = [...lines];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <>
      <div className="lines">
        {lines.map((line, index) => (
          <div className="line-card" key={index}>
            <div className="line-card-head">
              <strong>品項 {index + 1}</strong>
              {readOnly ? null : (
                <div className="line-card-tools">
                  <button
                    aria-label={`把品項 ${index + 1} 往上移`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    type="button"
                  >
                    <ArrowUp aria-hidden="true" size={15} />
                  </button>
                  <button
                    aria-label={`把品項 ${index + 1} 往下移`}
                    disabled={index === lines.length - 1}
                    onClick={() => move(index, 1)}
                    type="button"
                  >
                    <ArrowDown aria-hidden="true" size={15} />
                  </button>
                  <button
                    aria-label={`刪除品項 ${index + 1}`}
                    disabled={lines.length === 1}
                    onClick={() => onChange(lines.filter((_, position) => position !== index))}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={15} />
                  </button>
                </div>
              )}
            </div>

            <FormGrid columns={3}>
              {activeItems.length && !readOnly ? (
                <SelectField
                  hint="選擇後會帶入名稱、說明與預設單價，之後仍可修改。"
                  label="從常用品項帶入"
                  onChange={(event) => {
                    const item = activeItems.find((candidate) => candidate.id === event.target.value);
                    if (!item) return;
                    update(index, {
                      description: item.description,
                      discountAmount: "0",
                      name: item.name,
                      unitPrice: String(item.unitPrice),
                    });
                  }}
                  span
                  value=""
                >
                  <option value="">手動輸入</option>
                  {activeItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.sku ? `（${item.sku}）` : ""} — {currencyAmount(currency, item.unitPrice)}
                    </option>
                  ))}
                </SelectField>
              ) : null}
              <Field
                disabled={readOnly}
                error={errors?.[index]?.name}
                label="名稱"
                onChange={(event) => update(index, { name: event.target.value })}
                placeholder="顧問服務"
                required
                span
                value={line.name}
              />
              <Field
                disabled={readOnly}
                error={errors?.[index]?.quantity}
                inputMode="decimal"
                label="數量"
                min="0.001"
                onChange={(event) => update(index, { quantity: event.target.value })}
                required
                step="0.001"
                type="number"
                value={line.quantity}
              />
              <Field
                disabled={readOnly}
                error={errors?.[index]?.unitPrice}
                inputMode="decimal"
                label={`單價（${currency}）`}
                min="0"
                onChange={(event) => update(index, { unitPrice: event.target.value })}
                required
                step="0.01"
                type="number"
                value={line.unitPrice}
              />
              <Field
                disabled={readOnly}
                error={errors?.[index]?.discountAmount}
                hint={index === 0 ? "這一列的固定折扣金額。" : undefined}
                inputMode="decimal"
                label={`折扣（${currency}）`}
                min="0"
                onChange={(event) => update(index, { discountAmount: event.target.value })}
                step="0.01"
                type="number"
                value={line.discountAmount}
              />
              <Field
                disabled={readOnly}
                hint={index === 0 ? "會印在品項名稱下方。" : undefined}
                label="說明"
                onChange={(event) => update(index, { description: event.target.value })}
                placeholder="包含前期訪談與書面建議"
                span
                value={line.description}
              />
            </FormGrid>

            <p className="line-subtotal">
              <span>小計＝數量 × 單價 − 折扣</span>
              <b>{currencyAmount(currency, lineSubtotal(line))}</b>
            </p>
          </div>
        ))}
      </div>

      {readOnly ? null : (
        <div style={{ marginTop: 12 }}>
          <Button
            icon={<Plus aria-hidden="true" size={15} />}
            onClick={() => onChange([...lines, blankEditableLine()])}
            size="sm"
            variant="secondary"
          >
            再加一個品項
          </Button>
        </div>
      )}

      <p className="lines-total">
        <span>
          總折扣 {currency} {money(totals.discount)}
        </span>
        <strong>
          總金額 {currency} {money(totals.amount)}
        </strong>
      </p>
    </>
  );
}
