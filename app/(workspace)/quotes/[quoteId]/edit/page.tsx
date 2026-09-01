import { QuoteEditor } from "@/components/features/quotes/quote-editor";

export default async function EditQuotePage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;
  return <QuoteEditor quoteId={quoteId} />;
}
