import { QuoteDetail } from "@/components/features/quotes/quote-detail";

export default async function QuoteDetailPage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;
  return <QuoteDetail quoteId={quoteId} />;
}
