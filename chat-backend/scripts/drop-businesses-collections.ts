/**
 * One-off cleanup: drop the legacy `businesses` and `businessconnections`
 * collections after the business-account-switching migration.
 *
 * User has confirmed these collections contain only test/demo data (22 documents
 * in `businesses`, 5 documents in `businessconnections`) and they may be dropped.
 *
 * Run once:
 *   npx ts-node -r tsconfig-paths/register scripts/drop-businesses-collections.ts
 *
 * Or with a direct mongo shell command (no Node required):
 *   mongosh "$MONGODB_URI" --eval "
 *     db.businesses.drop();
 *     db.businessconnections.drop();
 *     print('done');
 *   "
 */

import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set in .env');
  }

  console.log('Connecting to MongoDB…');
  const conn = await mongoose.connect(uri);
  const db = conn.connection.db ?? mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB connection established but db handle is undefined');
  }

  const collections = await db.listCollections().toArray();
  const names = collections.map((c) => c.name);

  for (const col of ['businesses', 'businessconnections'] as const) {
    if (names.includes(col)) {
      await db.dropCollection(col);
      console.log(`Dropped collection: ${col}`);
    } else {
      console.log(`Collection not found (already gone?): ${col}`);
    }
  }

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
