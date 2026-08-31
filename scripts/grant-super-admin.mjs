import { MongoClient, ServerApiVersion } from "mongodb";

const email = process.argv[2]?.trim().toLowerCase();
const uri = process.env.MONGODB_URI;

if (!uri || !email) {
  console.error("Usage: MONGODB_URI=... npm run db:grant-super-admin -- admin@example.com");
  process.exitCode = 1;
} else {
  const client = new MongoClient(uri, {
    appName: "receipt-issuer-admin-bootstrap",
    serverApi: { deprecationErrors: true, strict: true, version: ServerApiVersion.v1 },
  });
  try {
    await client.connect();
    const users = client.db(process.env.MONGODB_DB || "receipt_issuer").collection("users");
    const result = await users.updateOne({ email }, { $set: { platformRole: "SUPER_ADMIN" } });
    if (!result.matchedCount) throw new Error(`No user exists for ${email}.`);
    console.log(`Granted SUPER_ADMIN to ${email}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Could not grant SUPER_ADMIN.");
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}
