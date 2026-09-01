import type { Metadata } from "next";

import { QuoteEditor } from "@/components/features/quotes/quote-editor";

export const metadata: Metadata = { title: "建立報價單｜RE-Biz" };

export default function NewQuotePage() {
  return <QuoteEditor />;
}
