import { MongoClient, ServerApiVersion } from "mongodb";

const migrationId = "20260908_plans-in-database";
const uri = process.env.MONGODB_URI;

/**
 * Moves plans out of the source and into the database.
 *
 * They were a hard-coded table, which made every price or allowance change a
 * code edit and a deploy. Pricing belongs to whoever runs the business, so the
 * plans become records the platform admin can edit.
 *
 * The three plans that were in the source are seeded verbatim, with a price of
 * zero: the allowances were always placeholders and no price had been decided,
 * so seeding an invented price would be worse than seeding none. Nothing about
 * what any company can do changes here.
 */
const seedPlans = [
  {
    _id: "free",
    allowances: { members: 2, quotationsPerMonth: 10, receiptsPerMonth: 20 },
    description: "讓新公司先把流程跑通，額度足夠日常試用。",
    features: ["receipts", "accounting"],
    isDefault: true,
    label: "免費",
    sortOrder: 10,
  },
  {
    _id: "starter",
    allowances: { members: 10, quotationsPerMonth: 150, receiptsPerMonth: 300 },
    description: "適合已經穩定出單、需要報價與請款的小公司。",
    features: ["receipts", "accounting", "quotations", "invoices"],
    isDefault: false,
    label: "標準",
    sortOrder: 20,
  },
  {
    _id: "pro",
    allowances: { members: null, quotationsPerMonth: null, receiptsPerMonth: null },
    description: "不限成員與用量，適合出單量大的公司。",
    features: ["receipts", "accounting", "quotations", "invoices"],
    isDefault: false,
    label: "專業",
    sortOrder: 30,
  },
];

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
      const plans = database.collection("plans");
      const now = new Date();
      for (const plan of seedPlans) {
        await plans.updateOne(
          { _id: plan._id },
          {
            $set: { ...plan, archived: false, createdAt: now, currency: "HKD", priceCents: 0, updatedAt: now },
          },
          { upsert: true },
        );
      }
      await plans.createIndex({ sortOrder: 1, _id: 1 });

      // Existing subscriptions carry no recorded price, which reads as "never
      // priced" rather than as "priced at zero" — the two are different and the
      // admin shows them differently.
      await database.collection("organizations").createIndex({ "subscription.planKey": 1 });

      await migrations.insertOne({ _id: migrationId, appliedAt: new Date() });
      console.log(`Applied ${migrationId}. Seeded ${seedPlans.length} plans; prices are 0 until they are set in the platform admin.`);
    }
  } finally {
    await client.close();
  }
}
