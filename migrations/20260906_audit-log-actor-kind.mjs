import { MongoClient, ServerApiVersion } from "mongodb";

const migrationId = "20260906_audit-log-actor-kind";
const uri = process.env.MONGODB_URI;

/**
 * Makes the audit log say which collection its actor lives in.
 *
 * Platform administrators moved out of `users` into `platformAdmins`, so
 * `actorUserId` alone could no longer be resolved. Existing rows name a customer
 * account that held SUPER_ADMIN when the change was made; they are marked
 * "legacyUser" rather than rewritten or removed, so the history stays
 * attributable instead of degrading to "unknown administrator".
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
      const auditLogs = database.collection("platformAuditLogs");
      const result = await auditLogs.updateMany(
        { actorUserId: { $exists: true } },
        [
          { $set: { actorId: "$actorUserId", actorKind: "legacyUser" } },
          { $unset: "actorUserId" },
        ],
      );

      await auditLogs.dropIndex("actorUserId_1_createdAt_-1").catch(() => {});
      await auditLogs.createIndex({ actorId: 1, createdAt: -1 });

      await migrations.insertOne({ _id: migrationId, appliedAt: new Date() });
      console.log(`Applied ${migrationId}. Re-pointed ${result.modifiedCount} historical audit row(s) at the users collection.`);
    }
  } finally {
    await client.close();
  }
}
