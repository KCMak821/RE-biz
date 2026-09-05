import { MongoClient, ServerApiVersion } from "mongodb";

const migrationId = "20260911_unique-stripe-customer-id";
const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("MONGODB_URI is required to run migrations.");
  process.exitCode = 1;
} else {
  const client = new MongoClient(uri, {
    appName: "receipt-issuer-migration",
    serverApi: { deprecationErrors: true, strict: true, version: ServerApiVersion.v1 },
  });

  try {
    await client.connect();
    const database = client.db(process.env.MONGODB_DB || "receipt_issuer");
    const migrations = database.collection("schemaMigrations");
    if (await migrations.findOne({ _id: migrationId })) {
      console.log(`${migrationId} has already been applied.`);
    } else {
      const duplicates = await database.collection("organizations").aggregate([
        { $match: { "subscription.externalCustomerId": { $type: "string", $ne: "" } } },
        { $group: { _id: "$subscription.externalCustomerId", count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $limit: 1 },
      ]).toArray();
      if (duplicates.length) {
        throw new Error(`Cannot make Stripe customer IDs unique: ${duplicates[0]._id} is linked to multiple workspaces.`);
      }
      await database.collection("organizations").createIndex(
        { "subscription.externalCustomerId": 1 },
        { name: "unique_stripe_customer_id", partialFilterExpression: { "subscription.externalCustomerId": { $type: "string" } }, unique: true },
      );
      await migrations.insertOne({ _id: migrationId, appliedAt: new Date() });
      console.log(`Applied ${migrationId}.`);
    }
  } finally {
    await client.close();
  }
}
