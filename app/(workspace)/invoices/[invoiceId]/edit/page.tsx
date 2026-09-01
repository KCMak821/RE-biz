import { InvoiceEditor } from "@/components/features/invoices/invoice-editor";

export default async function EditInvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  return <InvoiceEditor invoiceId={invoiceId} />;
}
