import type { Metadata } from "next";

import { CustomerList } from "@/components/features/customers/customer-list";

export const metadata: Metadata = { title: "客戶｜RE-Biz" };

export default function CustomersPage() {
  return <CustomerList />;
}
