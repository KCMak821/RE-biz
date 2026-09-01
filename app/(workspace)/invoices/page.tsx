import type { Metadata } from "next";

import { InvoiceList } from "@/components/features/invoices/invoice-list";

export const metadata: Metadata = { title: "請款單｜RE-Biz" };

export default function InvoicesPage() {
  return <InvoiceList />;
}
