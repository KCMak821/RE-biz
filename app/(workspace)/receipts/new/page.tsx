import type { Metadata } from "next";

import { ReceiptCreate } from "@/components/features/receipts/receipt-create";

export const metadata: Metadata = { title: "開立收據｜RE-Biz" };

export default function NewReceiptPage() {
  return <ReceiptCreate />;
}
