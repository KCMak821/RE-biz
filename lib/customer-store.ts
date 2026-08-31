import { ObjectId } from "mongodb";

import { getDatabase } from "@/lib/mongodb";
import type { CustomerFields } from "@/lib/quotation";

export type CustomerDocument = CustomerFields & {
  createdAt: Date;
  createdBy: ObjectId;
  organizationId: ObjectId;
  updatedAt: Date;
};

export async function customersCollection() {
  const collection = (await getDatabase()).collection<CustomerDocument>("customers");
  await Promise.all([
    collection.createIndex({ organizationId: 1, createdBy: 1, name: 1 }),
    collection.createIndex({ organizationId: 1, createdBy: 1, updatedAt: -1 }),
  ]);
  return collection;
}
