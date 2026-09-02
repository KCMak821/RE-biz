/**
 * Backfills `quotes.settlementPath`, the cross-collection lock for the two
 * routes out of an accepted quote.
 *
 * A unique index can keep one collection free of duplicates, but it cannot say
 * "either an invoice or a receipt, never both" — the two documents live in
 * different collections. That decision is now recorded on the quote itself and
 * taken with a single conditional update, so two simultaneous requests cannot
 * both win.
 *
 * For quotes settled before the field existed the claim has to be reconstructed
 * from the documents that actually exist, otherwise a historical quote would
 * look unclaimed and could still take its second route. Precedence is the
 * invoice: a quote that was billed stays on the billing path.
 *
 * This migration only ever fills the field in where it is absent. It never
 * overwrites a claim, never deletes anything, and re-running it changes nothing.
 */
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI.");

const BATCH = 1_000;

/** `$in` is bounded, so long id lists are applied in chunks. */
async function claimAll(quotes, ids, path) {
  let claimed = 0;
  for (let start = 0; start < ids.length; start += BATCH) {
    const result = await quotes.updateMany(
      { _id: { $in: ids.slice(start, start + BATCH) }, settlementPath: { $exists: false } },
      { $set: { settlementPath: path } },
    );
    claimed += result.modifiedCount;
  }
  return claimed;
}

const client = new MongoClient(uri);
try {
  await client.connect();
  const database = client.db(process.env.MONGODB_DB || "receipt_issuer");
  const quotes = database.collection("quotes");

  const sourced = { sourceQuoteId: { $type: "objectId" } };
  const [billed, receipted] = await Promise.all([
    database.collection("invoices").distinct("sourceQuoteId", sourced).catch(() => []),
    database.collection("receipts").distinct("sourceQuoteId", sourced).catch(() => []),
  ]);

  // Invoices first, so a quote that took both routes historically keeps the
  // billing path and its receipt is left as the record of what was collected.
  const asInvoice = await claimAll(quotes, billed, "invoice");
  const asReceipt = await claimAll(quotes, receipted, "receipt");

  const billedIds = new Set(billed.map((id) => id.toHexString()));
  const bothRoutes = receipted.filter((id) => billedIds.has(id.toHexString()));

  const settled = await quotes.countDocuments({ settlementPath: { $exists: true } });
  console.log(
    `Settlement paths backfilled: ${asInvoice} as "invoice", ${asReceipt} as "receipt" (${settled} quote(s) now hold a claim).`,
  );
  if (bothRoutes.length) {
    console.warn(
      `${bothRoutes.length} historical quote(s) have both an invoice and a direct receipt; they were claimed as "invoice".`,
    );
    console.warn(
      "Their income was still recognised once, at the receipt. Newly accepted quotes may take only one of the two routes.",
    );
  }
} finally {
  await client.close();
}
