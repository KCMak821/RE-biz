/* The logo and signature images are served from authenticated API routes, so
   they cannot pass through Next's image optimizer. */
/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";

import { CompanySeal, ReceiptPaper } from "@/components/features/receipts/receipt-paper";
import { money } from "@/lib/format";
import { normalizeUploadedSealLayout, type ReceiptTemplate } from "@/lib/receipt-template";
import { paymentMethodIsHidden } from "@/lib/receipt-form";
import type { ReceiptDraft } from "@/types/records";

export type BatchPrintLayout = "paper-saving" | "standard" | "ultra-saving";

type BatchReceiptPrintProps = {
  currency: string;
  layout: BatchPrintLayout;
  logoUrl?: string;
  preview?: boolean;
  receipts: ReceiptDraft[];
  sealUrl?: string;
  template: ReceiptTemplate;
};

/**
 * Print-only composition for a batch.  It deliberately reuses ReceiptPaper so
 * both layouts keep the same receipt data and business rules.
 */
export function BatchReceiptPrint({
  currency,
  layout,
  logoUrl,
  preview = false,
  receipts,
  sealUrl,
  template,
}: BatchReceiptPrintProps) {
  if (layout === "standard") {
    return (
      <div className={preview ? "receipt-print-pages receipt-print-pages--preview" : "receipt-print-pages"}>
        {receipts.map((receipt, index) => (
          <ReceiptPaper
            currency={currency}
            key={`${receipt.receiptNumber}-${index}`}
            logoUrl={logoUrl}
            receipt={receipt}
            sealUrl={sealUrl}
            template={template}
          />
        ))}
      </div>
    );
  }

  if (layout === "ultra-saving") {
    return (
      <div className={`receipt-print-pages receipt-print-pages--ultra-saving${preview ? " receipt-print-pages--preview" : ""}`}>
        {chunkReceipts(receipts, 4).map((page, pageIndex) => (
          <UltraSavingPage
            currency={currency}
            key={`${page[0].receiptNumber}-${pageIndex}`}
            logoUrl={logoUrl}
            page={page}
            pageIndex={pageIndex}
            sealUrl={sealUrl}
            template={template}
          />
        ))}
      </div>
    );
  }

  const pages = chunkReceipts(receipts, 2);
  return (
    <div
      className={`receipt-print-pages receipt-print-pages--paper-saving${preview ? " receipt-print-pages--preview" : ""}`}
    >
      {pages.map((page, pageIndex) => {
        const [first, second] = page;
        return (
          <section
            aria-label={`節省紙張版第 ${pageIndex + 1} 頁`}
            className={`receipt-print-page receipt-print-page--paper-saving${second ? "" : " receipt-print-page--single"}`}
            key={`${first.receiptNumber}-${pageIndex}`}
          >
            <ReceiptPaper
              currency={currency}
              logoUrl={logoUrl}
              receipt={first}
              sealUrl={sealUrl}
              template={template}
              variant="compact"
            />
            {second ? <CutGuide /> : null}
            {second ? (
              <ReceiptPaper
                currency={currency}
                logoUrl={logoUrl}
                receipt={second}
                sealUrl={sealUrl}
                template={template}
                variant="compact"
              />
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function UltraSavingPage({
  currency,
  logoUrl,
  page,
  pageIndex,
  sealUrl,
  template,
}: {
  currency: string;
  logoUrl?: string;
  page: ReceiptDraft[];
  pageIndex: number;
  sealUrl?: string;
  template: ReceiptTemplate;
}) {
  return (
    <section aria-label={`超節省紙張版第 ${pageIndex + 1} 頁`} className="receipt-print-page receipt-print-page--ultra-saving">
      {page.map((receipt, index) => (
        <MiniReceiptPaper
          currency={currency}
          index={index}
          key={`${receipt.receiptNumber}-${index}`}
          logoUrl={logoUrl}
          receipt={receipt}
          sealUrl={sealUrl}
          template={template}
        />
      ))}
      {page.length >= 2 ? <div aria-hidden="true" className="mini-cut-guide mini-cut-guide--vertical" /> : null}
      {page.length >= 3 ? <div aria-hidden="true" className="mini-cut-guide mini-cut-guide--horizontal" /> : null}
    </section>
  );
}

function MiniReceiptPaper({
  currency,
  index,
  logoUrl,
  receipt,
  sealUrl,
  template,
}: {
  currency: string;
  index: number;
  logoUrl?: string;
  receipt: ReceiptDraft;
  sealUrl?: string;
  template: ReceiptTemplate;
}) {
  const particulars = receipt.lineItems?.length
    ? receipt.lineItems.map((item) => [item.name, item.description].filter(Boolean).join("：")).join("；")
    : receipt.description;
  if (isTooLongForMiniReceipt(receipt, particulars)) {
    return (
      <article className={`mini-receipt mini-receipt--warning mini-receipt--${index}`}>
        <p className="mini-receipt-company">{receipt.issuerName || "YOUR BUSINESS NAME"}</p>
        <p className="mini-receipt-number">{receipt.receiptNumber || "儲存時自動派號"}</p>
        <strong>此收據內容較長，建議改用每頁 2 張或標準版列印。</strong>
      </article>
    );
  }

  const isUploadedSignature = template.showSeal && template.sealSource === "uploaded" && Boolean(sealUrl);
  const isGeneratedSeal = template.showSeal && template.sealSource === "generated" && Boolean(template.sealChineseName || template.sealEnglishName);
  const showPayment = template.showPaymentMethod && !paymentMethodIsHidden(receipt.paymentMethod) && Boolean(receipt.paymentMethod);
  const signatureStyle = isUploadedSignature ? miniSignatureStyle(template) : {};

  return (
    <article
      className={`mini-receipt mini-receipt--${index}`}
      style={{ "--mini-receipt-accent": template.accentColor, ...signatureStyle } as CSSProperties}
    >
      <header className="mini-receipt-header">
        <div>
          {logoUrl ? <img alt="公司 Logo" className="mini-receipt-logo" src={logoUrl} /> : null}
          <strong>{receipt.issuerName || "YOUR BUSINESS NAME"}</strong>
        </div>
        <b>{template.receiptTitle || "RECEIPT"}</b>
      </header>
      <div className="mini-receipt-meta">
        <span>No. {receipt.receiptNumber || "儲存時自動派號"}</span>
        <span>{receipt.issueDate || "—"}</span>
      </div>
      <div className="mini-receipt-main">
        <p><small>收款人</small>{receipt.payerName || "—"}</p>
        <p><small>項目</small>{particulars || "—"}</p>
      </div>
      <div className="mini-receipt-total">
        <span>收款金額</span>
        <strong>{currency} {money(receipt.amount)}</strong>
      </div>
      {showPayment || receipt.notes ? (
        <div className="mini-receipt-notes">
          {showPayment ? <p><small>付款方式</small>{receipt.paymentMethod}</p> : null}
          {receipt.notes ? <p><small>備註</small>{receipt.notes}</p> : null}
        </div>
      ) : null}
      {isUploadedSignature || isGeneratedSeal || template.showSignature ? (
        <div className="mini-signature-block">
          <div className="mini-signature-field">
            {isUploadedSignature ? (
              <div className="mini-signature-slot"><img alt="授權簽名" src={sealUrl} /></div>
            ) : isGeneratedSeal ? (
              <CompanySeal chineseName={template.sealChineseName} englishName={template.sealEnglishName} />
            ) : null}
            <div className="mini-signature-line" />
          </div>
          <span>Authorized signature</span>
        </div>
      ) : null}
    </article>
  );
}

function CutGuide() {
  return (
    <div aria-hidden="true" className="receipt-cut-guide">
      <span>沿線裁切</span>
    </div>
  );
}

function chunkReceipts(receipts: ReceiptDraft[], size: number) {
  const pages: ReceiptDraft[][] = [];
  for (let index = 0; index < receipts.length; index += size) pages.push(receipts.slice(index, index + size));
  return pages;
}

function isTooLongForMiniReceipt(receipt: ReceiptDraft, particulars: string) {
  return (
    receipt.issuerName.length > 56 ||
    receipt.payerName.length > 62 ||
    particulars.length > 150 ||
    receipt.notes.length > 110 ||
    (receipt.lineItems?.length ?? 0) > 3
  );
}

function miniSignatureStyle(template: ReceiptTemplate) {
  const safeTemplate = normalizeUploadedSealLayout(template);
  return {
    "--mini-signature-offset-x": `${(safeTemplate.uploadedSealOffsetX * 96) / 190}px`,
    "--mini-signature-offset-y": `${(safeTemplate.uploadedSealOffsetY * 28) / 64}px`,
    "--mini-signature-scale": `${safeTemplate.uploadedSealScale}%`,
  };
}
