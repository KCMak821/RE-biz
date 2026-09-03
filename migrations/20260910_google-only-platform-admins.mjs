import { MongoClient, ServerApiVersion } from "mongodb";

const migrationId = "20260910_google-only-platform-admins";
const uri = process.env.MONGODB_URI;

/**
 * Platform administrators now sign in with Google, and who may administer the
 * platform is decided by the PLATFORM_ADMIN_EMAILS environment variable.
 *
 * There is no admin password any more, so stored hashes are removed rather than
 * left lying around: a credential nothing can use is still a credential worth
 * stealing. The `status` field goes too — the allowlist is the only authority
 * on who has access, and a second switch that disagreed with it would be a bug
 * waiting to happen.
 *
 * Existing rows are kept: sessions and audit-log entries point at them.
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
      const result = await database.collection("platformAdmins").updateMany(
        {},
        { $unset: { passwordHash: "", status: "" } },
      );
      // Every open password-era session is invalidated: the way in changed, so
      // the sessions issued by the old way should not outlive it.
      const sessions = await database.collection("platformAdminSessions").deleteMany({});

      await migrations.insertOne({ _id: migrationId, appliedAt: new Date() });
      console.log(
        `Applied ${migrationId}. Cleared credentials from ${result.modifiedCount} administrator record(s) ` +
          `and ended ${sessions.deletedCount} session(s). Set PLATFORM_ADMIN_EMAILS to grant access.`,
      );
    }
  } finally {
    await client.close();
  }
}
