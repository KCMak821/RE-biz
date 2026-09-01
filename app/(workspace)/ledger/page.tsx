import type { Metadata } from "next";

import { LedgerView } from "@/components/features/ledger/ledger-view";

export const metadata: Metadata = { title: "收支記帳｜RE-Biz" };

export default function LedgerPage() {
  return <LedgerView />;
}
