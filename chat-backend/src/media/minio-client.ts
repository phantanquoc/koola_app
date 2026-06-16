import * as Minio from 'minio';

// Region must be pinned. When it is omitted, minio-js lazily resolves the
// bucket region via a `GET /<bucket>?location` network call against the
// client's own endpoint. For the public client that endpoint is the
// device-facing host (e.g. 10.0.2.2, the Android emulator host-loopback
// alias) which the backend itself cannot reach — the lookup then throws and
// presigned URL generation fails with a 503. Pinning the region makes
// getBucketRegionAsync() short-circuit, so no lookup is ever attempted.
const MINIO_REGION = process.env.MINIO_REGION || 'us-east-1';

// Internal client — used for backend ↔ MinIO traffic (object ops, streaming,
// bucket management). Always talks to the MinIO host directly.
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ROOT_USER || 'chatadmin',
  secretKey: process.env.MINIO_ROOT_PASSWORD || 'changeme123',
  region: MINIO_REGION,
});

// Public client — used only to sign presigned PUT/GET URLs that are returned
// to mobile clients. The hostname in the signed URL must be reachable from the
// device, not from the backend server.
//
// Falls back to the internal endpoint vars when the PUBLIC_* vars are not set,
// preserving backward compatibility for environments where both are the same.
//
// Exposed as a cached factory so the dev-env-watcher can invalidate it when
// MINIO_PUBLIC_HOST changes at runtime (hot-reload without server restart).
let _publicClient: Minio.Client | null = null;

function buildPublicClient(): Minio.Client {
  return new Minio.Client({
    endPoint:
      process.env.MINIO_PUBLIC_HOST ||
      process.env.MINIO_ENDPOINT ||
      'localhost',
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
    region: MINIO_REGION,
  });
}

export function getMinioPublicClient(): Minio.Client {
  if (!_publicClient) _publicClient = buildPublicClient();
  return _publicClient;
}

export function invalidateMinioPublicClient(): void {
  _publicClient = null;
}

const BUCKET = process.env.MINIO_BUCKET || 'chat-media';

export { minioClient, BUCKET };

export async function ensureBucketExists(): Promise<void> {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    await minioClient.makeBucket(BUCKET);
    console.log(`[MinIO] Bucket '${BUCKET}' created.`);
  } else {
    console.log(`[MinIO] Bucket '${BUCKET}' already exists.`);
  }
}
