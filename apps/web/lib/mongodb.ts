import { MongoClient, ServerApiVersion } from "mongodb";

// The connection string must come from the environment. (A hard-coded Atlas URI
// with credentials used to live here; it has been removed and must be rotated.)
const createClient = () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Add it to apps/web/.env.local (see SETUP_TODO.md).",
    );
  }
  return new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
};

const globalWithMongo = global as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

/** Lazily connects once per process (and once across dev hot reloads). */
export function getClientPromise(): Promise<MongoClient> {
  if (!globalWithMongo._mongoClientPromise) {
    try {
      globalWithMongo._mongoClientPromise = createClient().connect();
    } catch (error) {
      return Promise.reject(error);
    }
    globalWithMongo._mongoClientPromise.catch(() => {
      // allow a retry on the next call instead of caching a failed connection
      globalWithMongo._mongoClientPromise = undefined;
    });
  }
  return globalWithMongo._mongoClientPromise;
}

export async function getDb() {
  const client = await getClientPromise();
  // Uses the database named in the URI (e.g. .../news_aggregator), else the default DB.
  return client.db();
}
