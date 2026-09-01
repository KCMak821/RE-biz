import type { Metadata } from "next";

import { ReceiptList } from "@/components/features/receipts/receipt-list";

export const metadata: Metadata = { title: "收據｜RE-Biz" };

export default function ReceiptsPage() {
  return <ReceiptList />;
}
