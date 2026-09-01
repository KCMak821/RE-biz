import type { Metadata } from "next";

import { InvoiceEditor } from "@/components/features/invoices/invoice-editor";

export const metadata: Metadata = { title: "建立請款單｜RE-Biz" };

export default function NewInvoicePage() {
  return <InvoiceEditor />;
}
