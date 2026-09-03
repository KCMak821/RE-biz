import { MongoClient, ServerApiVersion } from "mongodb";

const migrationId = "20260907_workspace-subscriptions";
const uri = process.env.MONGODB_URI;

/**
 * Groundwork for paid subscriptions: every company gets a subscription record.
 *
 * Existing companies are put on the default plan with an "active" status and
 * their own creation date as the start, which is the reading that changes
 * nothing for them. Nothing is enforced anywhere, so this is bookkeeping the
 * platform admin can see rather than a change in what anyone may do.
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
      const organizations = database.collection("organizations");
      const result = await organizations.updateMany(
        { subscription: { $exists: false } },
        [
          {
            $set: {
              subscription: {
                planKey: "free",
                startedAt: "$createdAt",
                status: "active",
              },
            },
          },
        ],
      );

      await Promise.all([
        organizations.createIndex({ "subscription.planKey": 1 }),
        organizations.createIndex({ "subscription.status": 1 }),
      ]);

      await migrations.insertOne({ _id: migrationId, appliedAt: new Date() });
      console.log(`Applied ${migrationId}. Put ${result.modifiedCount} company/companies on the default plan.`);
    }
  } finally {
    await client.close();
  }
}
