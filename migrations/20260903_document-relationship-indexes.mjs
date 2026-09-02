/**
 * Locks the Quote → Invoice → Receipt chain down in the database.
 *
 * RE-Biz recognises income exactly once, at the receipt. That promise is only
 * as good as the constraints behind it, so this migration installs the three
 * partial unique indexes the workflow depends on:
 *
 *   invoices  { organizationId, sourceQuoteId }    — one invoice per quote
 *   receipts  { organizationId, sourceQuoteId }    — one receipt per quote
 *   receipts  { organizationId, sourceInvoiceId }  — one receipt per invoice
 *
 * They are partial so ordinary manual receipts and hand-written invoices, which
 * carry no source at all, are untouched.
 *
 * Nothing here writes to business data. If a unique index cannot be created
 * honestly the migration reports every conflicting document and stops, because
 * choosing which duplicate to keep is a human decision. Re-running on an
 * unchanged database is a no-op.
 */
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI.");

const specs = [
  { collection: "invoices", field: "sourceQuoteId", label: "報價單 → 請款單", name: "invoice_source_quote_unique" },
  { collection: "receipts", field: "sourceQuoteId", label: "報價單 → 收據", name: "receipt_source_quote_unique" },
  { collection: "receipts", field: "sourceInvoiceId", label: "請款單 → 收據", name: "receipt_source_invoice_unique" },
];

/** Documents that would violate the unique index, grouped by the key they share. */
async function conflicts(collection, field) {
  return collection
    .aggregate([
      { $match: { [field]: { $type: "objectId" } } },
      { $group: { _id: { organizationId: "$organizationId", source: `$${field}` }, count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
      { $sort: { "_id.organizationId": 1 } },
    ])
    .toArray()
    .catch(() => []); // The collection may not exist yet on a fresh database.
}

function sameShape(index, spec) {
  return (
    index.unique === true &&
    Object.keys(index.key).join(",") === `organizationId,${spec.field}` &&
    index.partialFilterExpression?.[spec.field]?.$type === "objectId"
  );
}

const client = new MongoClient(uri);
try {
  await client.connect();
  const database = client.db(process.env.MONGODB_DB || "receipt_issuer");

  /* ------------------------------------------------------------ safety first
     Every conflict is reported before anything is created, so one run tells the
     operator the whole story rather than one problem at a time. */
  let blocked = false;
  for (const spec of specs) {
    const found = await conflicts(database.collection(spec.collection), spec.field);
    if (!found.length) continue;
    blocked = true;
    console.error(
      `Migration aborted: ${found.length} ${spec.label} relationship(s) are duplicated in ${spec.collection}.`,
    );
    for (const conflict of found) {
      console.error(
        `  organizationId=${conflict._id.organizationId} ${spec.field}=${conflict._id.source} (${conflict.count} documents)`,
      );
      for (const id of conflict.ids) console.error(`      _id=${id}`);
    }
  }
  if (blocked) {
    console.error(
      "\nNothing has been changed. Each source document may only have one downstream document;",
    );
    console.error("remove or detach the extra ones listed above, then re-run this migration.");
    process.exitCode = 1;
  } else {
    const created = [];
    for (const spec of specs) {
      const collection = database.collection(spec.collection);
      const existing = await collection.indexes().catch(() => []);
      const byName = existing.find((index) => index.name === spec.name);
      // Already correct: leave it alone so re-running costs nothing. Present but
      // built to an older shape: replace it rather than silently keeping it.
      if (byName && sameShape(byName, spec)) continue;
      if (byName) await collection.dropIndex(spec.name);
      await collection.createIndex(
        { organizationId: 1, [spec.field]: 1 },
        { name: spec.name, partialFilterExpression: { [spec.field]: { $type: "objectId" } }, unique: true },
      );
      created.push(`${spec.collection}.${spec.name}`);
    }

    /* ------------------------------------------------------------- advisory
       Historical data may contain a quote that took both routes at once: a
       receipt of its own and an invoice. That is legal history — the invoice
       never produced a second receipt — but it is worth naming, because the
       two paths are now mutually exclusive going forward. */
    const bothPaths = await database
      .collection("receipts")
      .aggregate([
        { $match: { sourceQuoteId: { $type: "objectId" } } },
        { $lookup: { as: "invoice", foreignField: "sourceQuoteId", from: "invoices", localField: "sourceQuoteId" } },
        { $match: { "invoice.0": { $exists: true } } },
        { $project: { receiptNumber: 1 } },
      ])
      .toArray()
      .catch(() => []);
    if (bothPaths.length) {
      console.warn(
        `${bothPaths.length} quote(s) have both a direct receipt and an invoice: ${bothPaths
          .map((receipt) => receipt.receiptNumber)
          .join(", ")}.`,
      );
      console.warn(
        "Their income was still counted once (the receipt). New quotes may take only one of the two routes.",
      );
    }

    console.log(`Relationship indexes ready. Created or rebuilt: ${created.join(", ") || "none (already current)"}.`);
  }
} finally {
  await client.close();
}
