import * as Minio from 'minio';

// Internal client — used for backend ↔ MinIO traffic (object ops, streaming,
// bucket management). Always talks to the MinIO host directly.
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ROOT_USER || 'chatadmin',
  secretKey: process.env.MINIO_ROOT_PASSWORD || 'changeme123',
});

// Public client — used only to sign presigned PUT/GET URLs that are returned
// to mobile clients. The hostname in the signed URL must be reachable from the
// device, not from the backend server.
//
// Falls back to the internal endpoint vars when the PUBLIC_* vars are not set,
// preserving backward compatibility for environments where both are the same.
const minioPublicClient = new Minio.Client({
  endPoint:
    process.env.MINIO_PUBLIC_HOST || process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(
    process.env.MINIO_PUBLIC_PORT || process.env.MINIO_PORT || '9000',
    10,
  ),
  useSSL:
    process.env.MINIO_PUBLIC_USE_SSL !== undefined
      ? process.env.MINIO_PUBLIC_USE_SSL === 'true'
      : process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ROOT_USER || 'chatadmin',
  secretKey: process.env.MINIO_ROOT_PASSWORD || 'changeme123',
});

const BUCKET = process.env.MINIO_BUCKET || 'chat-media';

export { minioClient, minioPublicClient, BUCKET };

export async function ensureBucketExists(): Promise<void> {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    await minioClient.makeBucket(BUCKET);
    console.log(`[MinIO] Bucket '${BUCKET}' created.`);
  } else {
    console.log(`[MinIO] Bucket '${BUCKET}' already exists.`);
  }
}
