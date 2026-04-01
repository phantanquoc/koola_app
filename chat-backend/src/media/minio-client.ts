import * as Minio from 'minio';

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ROOT_USER || 'chatadmin',
  secretKey: process.env.MINIO_ROOT_PASSWORD || 'changeme123',
});

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
