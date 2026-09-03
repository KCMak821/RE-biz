import { MongoClient, ServerApiVersion } from "mongodb";

const migrationId = "20260905_separate-platform-admins";
const uri = process.env.MONGODB_URI;

/**
 * Splits platform administrators away from customers.
 *
 * Platform access used to be `users.platformRole === "SUPER_ADMIN"`, which made
 * whoever ran RE-Biz a customer too: they owned a company, that company was
 * counted in the platform's own statistics, and a single cookie opened both the
 * product and the back office. Administrators now live in `platformAdmins` with
 * their own sessions, so this retires the old field.
 *
 * No account is migrated across automatically. Granting platform access is a
 * deliberate act, and a customer's password must not silently become an
 * administrator's password. Create the first administrator with:
 *   npm run admin:create -- admin@example.com "Their Name"
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
      const previousAdmins = await database.collection("users")
        .find({ platformRole: "SUPER_ADMIN" }, { projection: { email: 1 } })
        .toArray();

      await Promise.all([
        database.collection("platformAdmins").createIndex({ email: 1 }, { unique: true }),
        database.collection("platformAdminSessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        database.collection("platformAdminSessions").createIndex({ tokenHash: 1 }, { unique: true }),
        database.collection("platformAdminSessions").createIndex({ adminId: 1 }),
      ]);

      await database.collection("users").updateMany({}, { $unset: { platformRole: "" } });
      // The old compound index covered a field that no longer exists.
      await database.collection("users").dropIndex("accountStatus_1_platformRole_1").catch(() => {});
      await database.collection("users").createIndex({ accountStatus: 1 });

      await migrations.insertOne({ _id: migrationId, appliedAt: new Date() });
      console.log(`Applied ${migrationId}.`);
      if (previousAdmins.length) {
        console.log(
          `Platform access was removed from ${previousAdmins.length} customer account(s): ` +
            `${previousAdmins.map((admin) => admin.email).join(", ")}. ` +
            "They remain ordinary customers. Create dedicated administrators with `npm run admin:create`.",
        );
      }
    }
  } finally {
    await client.close();
  }
}
