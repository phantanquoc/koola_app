/**
 * grant-admin.ts — Bootstrap the first platform admin.
 *
 * Idempotent: sets isPlatformAdmin=true on the target user.
 * Safe to run multiple times — has no effect if already an admin.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/grant-admin.ts --email admin@example.com
 *   npx ts-node -r tsconfig-paths/register scripts/grant-admin.ts --phone +84900000000
 *   npx ts-node -r tsconfig-paths/register scripts/grant-admin.ts --id <mongoObjectId>
 *
 * Requires: MONGODB_URI env var (or .env file in chat-backend/).
 *
 * Mongosh equivalent (one-liner):
 *   db.users.updateOne({ email: "admin@example.com" }, { $set: { isPlatformAdmin: true } })
 */

import 'dotenv/config';
import mongoose from 'mongoose';

async function main() {
  const args = process.argv.slice(2);
  const emailIdx = args.indexOf('--email');
  const phoneIdx = args.indexOf('--phone');
  const idIdx = args.indexOf('--id');

  let filter: Record<string, string> | null = null;

  if (emailIdx !== -1 && args[emailIdx + 1]) {
    filter = { email: args[emailIdx + 1].toLowerCase() };
  } else if (phoneIdx !== -1 && args[phoneIdx + 1]) {
    filter = { phone: args[phoneIdx + 1] };
  } else if (idIdx !== -1 && args[idIdx + 1]) {
    filter = { _id: args[idIdx + 1] };
  }

  if (!filter) {
    console.error(
      'Usage: grant-admin.ts --email <email> | --phone <phone> | --id <id>',
    );
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI env var is required.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB.');

  // Use raw collection to avoid needing the full schema here
  const result = await mongoose.connection
    .collection('users')
    .updateOne(filter, { $set: { isPlatformAdmin: true } });

  if (result.matchedCount === 0) {
    console.error('No user found matching:', filter);
    process.exit(1);
  }

  console.log(
    `isPlatformAdmin set to true for user matching ${JSON.stringify(filter)} (modified: ${result.modifiedCount}).`,
  );

  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
