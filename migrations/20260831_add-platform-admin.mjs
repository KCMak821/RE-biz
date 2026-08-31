import { MongoClient, ServerApiVersion } from "mongodb";

const migrationId = "20260831_add-platform-admin";
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
      await Promise.all([
        database.collection("users").updateMany(
          { accountStatus: { $exists: false } }, { $set: { accountStatus: "active" } },
        ),
        database.collection("users").updateMany(
          { platformRole: { $exists: false } }, { $set: { platformRole: "USER" } },
        ),
        database.collection("organizations").updateMany(
          { status: { $exists: false } }, { $set: { status: "active" } },
        ),
      ]);

      const bootstrapEmails = (process.env.SUPER_ADMIN_EMAILS || "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
      if (bootstrapEmails.length) {
        await database.collection("users").updateMany(
          { email: { $in: bootstrapEmails } }, { $set: { platformRole: "SUPER_ADMIN" } },
        );
      }

      await Promise.all([
        database.collection("users").createIndex({ accountStatus: 1, platformRole: 1 }),
        database.collection("organizations").createIndex({ status: 1, createdAt: -1 }),
        database.collection("workspaceFeatures").createIndex({ organizationId: 1, featureKey: 1 }, { unique: true }),
        database.collection("platformAuditLogs").createIndex({ createdAt: -1 }),
        database.collection("platformAuditLogs").createIndex({ actorUserId: 1, createdAt: -1 }),
        database.collection("platformAuditLogs").createIndex({ targetType: 1, targetId: 1, createdAt: -1 }),
      ]);
      await migrations.insertOne({ _id: migrationId, appliedAt: new Date() });
      console.log(`Applied ${migrationId}.`);
    }
  } finally {
    await client.close();
  }
}
