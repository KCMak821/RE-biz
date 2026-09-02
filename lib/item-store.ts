import { ObjectId } from "mongodb";

import { getDatabase } from "@/lib/mongodb";
import type { ItemFields } from "@/lib/quotation";

/**
 * Item collection access, moved out of `app/api/items/route.ts`.
 *
 * A route file may only export route handlers; exporting the collection helper
 * from there made Next's generated route types fail the production build.
 */
export type ItemDocument = ItemFields & {
  createdAt: Date;
  createdBy: ObjectId;
  organizationId: ObjectId;
  updatedAt: Date;
};

export async function itemsCollection() {
  const collection = (await getDatabase()).collection<ItemDocument>("items");
  await Promise.all([
    collection.createIndex({ organizationId: 1, isActive: 1, name: 1 }),
    collection.createIndex({ organizationId: 1, updatedAt: -1 }),
  ]);
  return collection;
}

export function serializeItem(document: ItemDocument & { _id: ObjectId }) {
  return {
    ...document,
    createdAt: document.createdAt.toISOString(),
    id: document._id.toHexString(),
    updatedAt: document.updatedAt.toISOString(),
    _id: undefined,
    createdBy: undefined,
    organizationId: undefined,
  };
}
