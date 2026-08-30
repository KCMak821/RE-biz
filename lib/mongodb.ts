import { Db, MongoClient, ServerApiVersion } from "mongodb";

declare global {
  var mongoClientPromise: Promise<MongoClient> | undefined;
}

function getClientPromise() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI.");

  global.mongoClientPromise ??= new MongoClient(uri, {
    appName: "receipt-issuer",
    serverApi: {
      deprecationErrors: true,
      strict: true,
      version: ServerApiVersion.v1,
    },
  }).connect();
  return global.mongoClientPromise;
}

export async function getDatabase(): Promise<Db> {
  return (await getClientPromise()).db(process.env.MONGODB_DB || "receipt_issuer");
}
