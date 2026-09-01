import type { Metadata } from "next";

import { QuoteList } from "@/components/features/quotes/quote-list";

export const metadata: Metadata = { title: "報價單｜RE-Biz" };

export default function QuotesPage() {
  return <QuoteList />;
}
