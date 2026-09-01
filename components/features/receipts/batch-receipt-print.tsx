import { ReceiptPaper } from "@/components/features/receipts/receipt-paper";
import type { ReceiptTemplate } from "@/lib/receipt-template";
import type { ReceiptDraft } from "@/types/records";

export type BatchPrintLayout = "paper-saving" | "standard";

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
