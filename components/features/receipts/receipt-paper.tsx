/* The receipt is served from an authenticated API route, so the logo and seal
   images must bypass Next's image optimizer. */
/* eslint-disable @next/next/no-img-element */

import type { CSSProperties } from "react";

import { money } from "@/lib/format";
import { paymentMethodIsHidden } from "@/lib/receipt-form";
import { type ReceiptTemplate } from "@/lib/receipt-template";
import type { ReceiptDraft } from "@/types/records";

/**
 * The printed document. Moved out of the old single-file app unchanged so that
 * existing receipts print byte-for-byte the same as before.
 */
export function ReceiptPaper({
  currency,
  logoUrl,
  receipt,
  sealUrl,
  template,
  variant = "standard",
}: {
  currency: string;
  logoUrl?: string;
  receipt: ReceiptDraft;
  sealUrl?: string;
  template: ReceiptTemplate;
  /** The compact treatment is only used inside the two-up batch print sheet. */
  variant?: "compact" | "standard";
}) {
  const formattedAmount = money(receipt.amount);
  const lineItems = receipt.lineItems?.length ? receipt.lineItems : undefined;
  const showPaymentMethod = template.showPaymentMethod && !paymentMethodIsHidden(receipt.paymentMethod);
  const usesUploadedSeal = template.sealSource === "uploaded";
  const uploadedSealStyle = usesUploadedSeal ? uploadedSealLayoutStyle(template, variant) : {};
  const showSeal =
    template.showSeal &&
    (usesUploadedSeal ? Boolean(sealUrl) : Boolean(template.sealChineseName || template.sealEnglishName));
  const showBottom = showPaymentMethod || template.showSignature || showSeal;

  return (
    <article
      aria-label="收據內容"
      className={`receipt-paper${variant === "compact" ? " receipt-paper--compact" : ""} template-${template.preset} logo-${template.logoPosition}`}
      style={{ "--receipt-accent": template.accentColor, ...uploadedSealStyle } as CSSProperties}
    >
      <div className="receipt-topline" />
      <div className="receipt-header">
        <div className="issuer-block">
          {logoUrl ? <img alt="公司 Logo" className="receipt-company-logo" src={logoUrl} /> : null}
          <p className="issuer-name">{receipt.issuerName || "YOUR BUSINESS NAME"}</p>
          {receipt.issuerAddress ? <p>{receipt.issuerAddress}</p> : null}
          {template.showBusinessRegistration && receipt.businessRegistration ? (
            <p>BR No. {receipt.businessRegistration}</p>
          ) : null}
          {template.showContact && receipt.issuerContact ? <p>{receipt.issuerContact}</p> : null}
        </div>
        <div className="receipt-title-block">
          <p className="receipt-title">{template.receiptTitle}</p>
          <p className="receipt-title-cn">收據</p>
        </div>
      </div>
      <div className="receipt-meta">
        <div>
          <span>Receipt No.</span>
          <strong>{receipt.receiptNumber || "儲存時自動派號"}</strong>
        </div>
        <div>
          <span>Date</span>
          <strong>{receipt.issueDate || "—"}</strong>
        </div>
      </div>
      {receipt.sourceQuoteNumber ? (
        <p className="receipt-source-quote">Source quotation：{receipt.sourceQuoteNumber}</p>
      ) : null}
      <div className="bill-to">
        <span>Received from 收到款項自</span>
        <strong>{receipt.payerName || "—"}</strong>
        {receipt.payerAddress ? <p>{receipt.payerAddress}</p> : null}
      </div>
      {lineItems ? (
        <table className="receipt-line-items-table">
          <thead>
            <tr>
              <th>Particulars 項目</th>
              <th>Qty 數量</th>
              <th>Unit price 單價</th>
              <th>Discount 折扣</th>
              <th>Subtotal 小計</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, index) => (
              <tr key={`${item.name}-${index}`}>
                <td>
                  <strong>{item.name}</strong>
                  {item.description ? <small>{item.description}</small> : null}
                </td>
                <td>{item.quantity}</td>
                <td>
                  {currency} {money(item.unitPrice)}
                </td>
                <td>
                  {currency} {money(item.discountAmount)}
                </td>
                <td>
                  {currency} {money(item.subtotal)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Total 收款總額</td>
              <td>
                {currency} {formattedAmount}
              </td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <div className="receipt-table">
          <div className="table-header">
            <span>Particulars 項目</span>
            <span>Amount ({currency})</span>
          </div>
          <div className="table-row">
            <span>{receipt.description || "—"}</span>
            <strong>
              {currency} {formattedAmount}
            </strong>
          </div>
          <div className="table-total">
            <span>Total 收款總額</span>
            <strong>
              {currency} {formattedAmount}
            </strong>
          </div>
        </div>
      )}
      <div className="amount-words">
        <span>Amount payable</span>
        <strong>
          {currency} {formattedAmount}
        </strong>
      </div>
      {showBottom ? (
        <div className={`receipt-bottom ${showPaymentMethod ? "" : "payment-hidden"}`}>
          {showPaymentMethod ? (
            <div className="payment-details">
              <span>Payment method</span>
              <strong>{receipt.paymentMethod || "—"}</strong>
              {template.showNotes && receipt.notes ? <p>{receipt.notes}</p> : null}
            </div>
          ) : null}
          {template.showSignature || showSeal ? (
            <div className="signature-block">
              {showSeal ? (
                usesUploadedSeal ? (
                  <div className="uploaded-seal-frame">
                    <img alt="公司印章" className="company-seal company-seal-uploaded" src={sealUrl} />
                  </div>
                ) : (
                  <CompanySeal chineseName={template.sealChineseName} englishName={template.sealEnglishName} />
                )
              ) : null}
              {template.showSignature ? (
                <>
                  <div className="signature-line" />
                  <span>Authorized signature</span>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {template.showDisclaimer ? (
        <p className="receipt-disclaimer">
          This receipt acknowledges payment received and is not a tax invoice.
        </p>
      ) : null}
    </article>
  );
}

function uploadedSealLayoutStyle(template: ReceiptTemplate, variant: "compact" | "standard") {
  const baseSize = variant === "compact" ? 54 : 94;
  const ratio = baseSize / 94;
  const size = (baseSize * template.uploadedSealScale) / 100;
  const offsetY = template.uploadedSealOffsetY * ratio;
  const gap = variant === "compact" ? 4 : 8;
  return {
    "--uploaded-seal-frame-height": `${size + gap + Math.abs(offsetY)}px`,
    "--uploaded-seal-frame-margin-top": `${Math.min(offsetY, 0)}px`,
    "--uploaded-seal-frame-padding-top": `${Math.max(offsetY, 0)}px`,
    "--uploaded-seal-offset-x": `${template.uploadedSealOffsetX * ratio}px`,
    "--uploaded-seal-size": `${size}px`,
  };
}

function CompanySeal({ chineseName, englishName }: { chineseName: string; englishName: string }) {
  const chineseLines = chineseName.endsWith("工作室")
    ? [chineseName.slice(0, -3), "工作室"]
    : [chineseName.slice(0, Math.ceil(chineseName.length / 2)), chineseName.slice(Math.ceil(chineseName.length / 2))];
  const outerCharacters = englishName.toUpperCase().replace(/\s+/g, "·").split("");
  // A traditional company seal has a generous, separate text band. Keep the
  // lettering inside that band rather than letting it compete with the centre.
  const outerStartAngle = 154;
  const outerEndAngle = 386;

  return (
    <svg aria-label={`${chineseName} 公司印章`} className="company-seal" role="img" viewBox="0 0 200 200">
      <circle className="seal-outer-ring" cx="100" cy="100" r="93" />
      <circle className="seal-outer-ring seal-outer-ring-inner" cx="100" cy="100" r="85" />
      <circle className="seal-inner-ring" cx="100" cy="100" r="60" />
      {outerCharacters.map((character, index) => {
        const angle =
          outerStartAngle + ((outerEndAngle - outerStartAngle) * index) / Math.max(outerCharacters.length - 1, 1);
        const radians = (angle * Math.PI) / 180;
        const x = 100 + 73 * Math.cos(radians);
        const y = 100 + 73 * Math.sin(radians);
        return (
          <text
            className="seal-outer-letter"
            dominantBaseline="middle"
            key={`${character}-${index}`}
            textAnchor="middle"
            transform={`rotate(${angle + 90} ${x} ${y})`}
            x={x}
            y={y}
          >
            {character}
          </text>
        );
      })}
      <text className="seal-chinese" textAnchor="middle" x="100" y="89">
        {chineseLines[0]}
      </text>
      {chineseLines[1] ? (
        <text className="seal-chinese seal-chinese-lower" textAnchor="middle" x="100" y="121">
          {chineseLines[1]}
        </text>
      ) : null}
      <g className="seal-flower" transform="translate(100 172)">
        <line x1="-8" x2="8" y1="0" y2="0" />
        <line x1="0" x2="0" y1="-8" y2="8" />
        <line x1="-5.7" x2="5.7" y1="-5.7" y2="5.7" />
        <line x1="-5.7" x2="5.7" y1="5.7" y2="-5.7" />
      </g>
    </svg>
  );
}
