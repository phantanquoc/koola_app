/**
 * backfill-blurhash.ts — Generate blurhash for all image messages missing one.
 *
 * Idempotent: only touches messages where blurhash is null/missing.
 * Safe to re-run. Skips images whose object is missing from MinIO.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-blurhash.ts
 *
 * Requires: MONGODB_URI, MINIO_ENDPOINT, MINIO_PORT, MINIO_ROOT_USER,
 *           MINIO_ROOT_PASSWORD env vars (or .env file in chat-backend/).
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import * as Minio from 'minio';

const BUCKET = process.env.MINIO_BUCKET || 'chat-media';

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ROOT_USER || 'chatadmin',
  secretKey: process.env.MINIO_ROOT_PASSWORD || 'changeme123',
  region: process.env.MINIO_REGION || 'us-east-1',
});

async function encodeBlurhash(
  buffer: Buffer,
): Promise<{ blurhash: string; width: number; height: number }> {
  // sharp (off-event-loop native decode) replaced jimp — mirrors
  // MessagesService.encodeBlurhash so the backfill produces identical hashes.
  const sharp = require('sharp') as typeof import('sharp');
  const { encode } = require('blurhash') as typeof import('blurhash');

  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;

  const COMPONENT_X = 4;
  const COMPONENT_Y = 3;
  const THUMB_W = 32;
  const THUMB_H = Math.max(1, Math.round(THUMB_W * (height / (width || 1))));

  const { data, info } = await sharp(buffer)
    .resize(THUMB_W, THUMB_H, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const blurhash = encode(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
    COMPONENT_X,
    COMPONENT_Y,
  );

  return { blurhash, width, height };
}

async function downloadObject(mediaKey: string): Promise<Buffer> {
  const stream = await minioClient.getObject(BUCKET, mediaKey);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI env var is required.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB.');

  const messagesCol = mongoose.connection.collection('messages');

  const cursor = messagesCol.find({
    type: 'image',
    $or: [{ blurhash: null }, { blurhash: { $exists: false } }],
  });

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    scanned++;
    const mediaKey = doc.mediaUrl as string | undefined;
    if (!mediaKey) {
      console.warn(`  [SKIP] Message ${doc._id}: no mediaUrl field`);
      skipped++;
      continue;
    }

    try {
      const buffer = await downloadObject(mediaKey);
      const { blurhash, width, height } = await encodeBlurhash(buffer);

      await messagesCol.updateOne(
        { _id: doc._id },
        { $set: { blurhash, imageWidth: width, imageHeight: height } },
      );
      updated++;

      if (updated % 50 === 0) {
        console.log(`  Progress: ${updated} updated, ${scanned} scanned...`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  [SKIP] Message ${doc._id} (key: ${mediaKey}): ${msg}`);
      skipped++;
    }
  }

  console.log('\n── Backfill complete ──');
  console.log(`  Scanned: ${scanned}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);

  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
