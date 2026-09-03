import { MongoClient, ServerApiVersion } from "mongodb";

const migrationId = "20260909_stripe-customer-index";
const uri = process.env.MONGODB_URI;

/**
 * Indexes the Stripe customer id, which is how an incoming webhook finds the
 * company it is about. Sparse, because most companies have no Stripe customer:
 * linking one is a deliberate act in the platform admin.
 */
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
      await database.collection("organizations").createIndex(
        { "subscription.externalCustomerId": 1 },
        { sparse: true },
      );
      await database.collection("stripeEvents").createIndex(
        { receivedAt: 1 },
        { expireAfterSeconds: 60 * 60 * 24 * 30 },
      );
      await migrations.insertOne({ _id: migrationId, appliedAt: new Date() });
      console.log(`Applied ${migrationId}.`);
    }
  } finally {
    await client.close();
  }
}
