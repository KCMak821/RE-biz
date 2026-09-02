/**
 * Moves the workspace business data from a user-scoped model to an
 * organization-scoped one.
 *
 * Receipts, ledger entries, quotes, invoices and items used to be read with
 * `{ organizationId, createdBy }`, so a second member of the same company saw
 * an empty workspace. `organizationId` is now the only tenant boundary and
 * `createdBy` is audit trail. The indexes have to follow, and the quote number
 * counter has to become company-wide so two members cannot both mint
 * `QUO-YYYYMM-0001`.
 *
 * This migration is deliberately conservative: it refuses to run rather than
 * touch business data if the new company-level unique quote number index cannot
 * be created honestly.
 */
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI.");

/** Old indexes carried `createdBy` in the key; those are the ones to retire. */
async function dropIndexesWithKey(collection, field) {
  const dropped = [];
  let indexes;
  try {
    indexes = await collection.indexes();
  } catch {
    return dropped; // Collection does not exist yet on a fresh database.
  }
  for (const index of indexes) {
    if (index.name === "_id_" || !(field in index.key)) continue;
    await collection.dropIndex(index.name);
    dropped.push(index.name);
  }
  return dropped;
}

const client = new MongoClient(uri);
try {
  await client.connect();
  const database = client.db(process.env.MONGODB_DB || "receipt_issuer");
  const quotes = database.collection("quotes");
  const quoteCounters = database.collection("quoteCounters");

  /* ------------------------------------------------------------ safety check
     A company-level unique index cannot be created while two members of the
     same organization hold the same quote number. Report and stop; deciding
     which document keeps the number is a human call, not a migration's. */
  const duplicates = await quotes
    .aggregate([
      {
        $group: {
          _id: { organizationId: "$organizationId", quoteNumber: "$quoteNumber" },
          count: { $sum: 1 },
          quotes: { $push: { _id: "$_id", createdBy: "$createdBy", issueDate: "$issueDate" } },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { "_id.organizationId": 1, "_id.quoteNumber": 1 } },
    ])
    .toArray();

  if (duplicates.length) {
    console.error(
      `Migration aborted: ${duplicates.length} quote number(s) are duplicated inside one organization.`,
    );
    console.error(
      "The company-level unique index cannot be created until each of these keeps a single quote.",
    );
    console.error(
      "Nothing has been changed. Renumber or remove the extra quotes below, then re-run this migration.\n",
    );
    for (const duplicate of duplicates) {
      console.error(
        `organizationId=${duplicate._id.organizationId} quoteNumber=${duplicate._id.quoteNumber} (${duplicate.count} documents)`,
      );
      for (const quote of duplicate.quotes) {
        console.error(
          `    _id=${quote._id} createdBy=${quote.createdBy} issueDate=${quote.issueDate}`,
        );
      }
    }
    process.exitCode = 1;
  } else {
    /* ------------------------------------------------- quote number counters
       Rebuild the counters as `{ organizationId, monthKey }`. The authority is
       the quotes actually issued, so the next number can never collide with an
       existing one; the old per-user counters are folded in as a lower bound
       so a month whose quotes were deleted still never reissues a number. */
    const issued = await quotes
      .aggregate([
        { $match: { quoteNumber: { $regex: "^QUO-\\d{6}-\\d+$" } } },
        {
          $project: {
            organizationId: 1,
            monthKey: { $substrBytes: ["$quoteNumber", 4, 6] },
            sequence: { $toInt: { $substrBytes: ["$quoteNumber", 11, 12] } },
          },
        },
        {
          $group: {
            _id: { organizationId: "$organizationId", monthKey: "$monthKey" },
            sequence: { $max: "$sequence" },
          },
        },
      ])
      .toArray();

    const highest = new Map();
    const keyOf = (organizationId, monthKey) => `${organizationId}:${monthKey}`;
    const remember = (organizationId, monthKey, sequence) => {
      const key = keyOf(organizationId, monthKey);
      const current = highest.get(key);
      if (!current) highest.set(key, { monthKey, organizationId, sequence });
      else current.sequence = Math.max(current.sequence, sequence);
    };
    for (const group of issued) {
      remember(group._id.organizationId, group._id.monthKey, group.sequence);
    }

    const legacyCounters = await quoteCounters.find({ userId: { $exists: true } }).toArray();
    const memberships = database.collection("memberships");
    let ambiguous = 0;
    for (const counter of legacyCounters) {
      const owned = await memberships
        .find({ userId: counter.userId }, { projection: { organizationId: 1 } })
        .toArray();
      // A user in exactly one organization maps unambiguously. Anything else is
      // left to the quotes-derived maximum rather than guessed at.
      if (owned.length !== 1) {
        ambiguous += 1;
        continue;
      }
      remember(owned[0].organizationId, counter.monthKey, counter.sequence ?? 0);
    }
    if (ambiguous) {
      console.warn(
        `${ambiguous} legacy quote counter(s) belong to a user in zero or several organizations; their sequences were derived from the issued quotes instead.`,
      );
    }

    // The old `{ userId, monthKey }` unique index would reject the rewritten
    // documents, so it goes before anything is written.
    const droppedCounterIndexes = await dropIndexesWithKey(quoteCounters, "userId");
    const now = new Date();
    for (const { monthKey, organizationId, sequence } of highest.values()) {
      await quoteCounters.updateOne(
        { organizationId, monthKey },
        {
          $max: { sequence },
          $set: { updatedAt: now },
          $setOnInsert: { createdAt: now, monthKey, organizationId },
        },
        { upsert: true },
      );
    }
    const removedLegacy = await quoteCounters.deleteMany({ userId: { $exists: true } });
    await quoteCounters.createIndex({ organizationId: 1, monthKey: 1 }, { unique: true });

    /* --------------------------------------------------------------- indexes
       Retire every `createdBy`-keyed index and create the organization-scoped
       replacements, including the real company-level unique quote number. */
    const droppedByCollection = {};
    for (const name of ["quotes", "invoices", "items", "receipts"]) {
      droppedByCollection[name] = await dropIndexesWithKey(database.collection(name), "createdBy");
    }

    await Promise.all([
      quotes.createIndex({ organizationId: 1, quoteNumber: 1 }, { unique: true }),
      quotes.createIndex({ organizationId: 1, issueDate: -1, createdAt: -1 }),
      quotes.createIndex({ organizationId: 1, status: 1, validUntil: 1 }),
      database.collection("invoices").createIndex({ organizationId: 1, issueDate: -1, createdAt: -1 }),
      database.collection("invoices").createIndex({ organizationId: 1, status: 1, dueDate: 1 }),
      database.collection("items").createIndex({ organizationId: 1, isActive: 1, name: 1 }),
      database.collection("items").createIndex({ organizationId: 1, updatedAt: -1 }),
      database.collection("receipts").createIndex({ organizationId: 1, issueDate: -1, createdAt: -1 }),
      database.collection("ledgerEntries").createIndex({ organizationId: 1, date: -1, createdAt: -1 }),
    ]);

    console.log(
      `Rebuilt ${highest.size} organization-scoped quote counter(s); removed ${removedLegacy.deletedCount} legacy user-scoped counter(s).`,
    );
    console.log(
      `Dropped counter indexes: ${droppedCounterIndexes.join(", ") || "none"}.`,
    );
    for (const [name, dropped] of Object.entries(droppedByCollection)) {
      console.log(`Dropped ${name} user-scoped indexes: ${dropped.join(", ") || "none"}.`);
    }
    console.log("Organization-scoped indexes created.");
  }
} finally {
  await client.close();
}
