import type { Metadata } from "next";

import { ItemList } from "@/components/features/items/item-list";

export const metadata: Metadata = { title: "商品與服務｜RE-Biz" };

export default function ItemsPage() {
  return <ItemList />;
}
