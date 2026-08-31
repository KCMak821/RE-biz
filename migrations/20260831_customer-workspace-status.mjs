import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI.");

const client = new MongoClient(uri);
try {
  await client.connect();
  const customers = client
    .db(process.env.MONGODB_DB || "receipt_issuer")
    .collection("customers");
  const result = await customers.updateMany(
    { status: { $exists: false } },
    { $set: { status: "active" } },
  );
  await Promise.all([
    customers.updateMany(
      { companyName: { $exists: false } },
      { $set: { companyName: "" } },
    ),
    customers.updateMany(
      { businessRegistration: { $exists: false } },
      { $set: { businessRegistration: "" } },
    ),
  ]);
  await Promise.all([
    customers.createIndex({ organizationId: 1, status: 1, updatedAt: -1 }),
    customers.createIndex({ organizationId: 1, name: 1 }),
  ]);
  console.log(`Migrated ${result.modifiedCount} customers.`);
} finally {
  await client.close();
}
