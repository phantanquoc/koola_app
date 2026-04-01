## backend-media — Implementation Tasks

### Prerequisites
- [ ] Install `@nestjs/schedule` into `chat-backend`

---

### 7.1 — MinIO Client Setup

- [ ] 7.1.1 Add `@nestjs/schedule` dependency: `npm install @nestjs/schedule`
- [ ] 7.1.2 Import `ScheduleModule.forRoot()` in `AppModule`
- [ ] 7.1.3 Add `MINIO_PUBLIC_URL` to `.env` (e.g., `http://localhost:9000`)
- [ ] 7.1.4 Create `src/media/minio-client.ts`: initialize `new MinIO.Client()` singleton using env vars (`MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`)
- [ ] 7.1.5 Add `ensureBucketExists()` on module init using `minioClient.bucketExists()` + `minioClient.makeBucket()` if missing
- [ ] 7.1.6 Verify: MinIO client connects successfully on app start (log bucket check result)

---

### 7.2 — Media Schema

- [ ] 7.2.1 Create `src/media/media.schema.ts`: define `Media` schema with fields: `mediaKey` (unique), `uploaderId`, `mimeType`, `size`, `deleted` (default false), `thumbnailKey` (nullable), `conversationId` (nullable), `messageId` (nullable), `createdAt`, `updatedAt` (from `@Schema({ timestamps: true })`)
- [ ] 7.2.2 Add indexes: `mediaKey` (unique), `uploaderId`, `conversationId`, `deleted + createdAt`
- [ ] 7.2.3 Create `src/media/media.schema.ts` export: `Media`, `MediaDocument`, `MediaSchema`

---

### 7.3 — Media Service — Presigned URL Generation

- [ ] 7.3.1 Create `src/media/dto/request-presigned-url.dto.ts`: DTO with `filename` (string, required), `mimeType` (string, required), `size` (number, required, max 104857600), `conversationId` (string, optional), `generateThumbnail` (boolean, default false)
- [ ] 7.3.2 Add `class-validator` decorators: `@IsString()`, `@IsEnum()` for mimeType using allowed types list, `@Max(104857600)`
- [ ] 7.3.3 Define `SUPPORTED_MIME_TYPES` constant in `media.service.ts` — full whitelist from design.md
- [ ] 7.3.4 Define `MAGIC_BYTES_MAP` constant — magic byte signatures from design.md
- [ ] 7.3.5 Create `validateMimeType(mimeType: string): boolean` — checks against whitelist
- [ ] 7.3.6 Create `validateMagicBytes(buffer: Buffer, mimeType: string): boolean` — checks file magic bytes match declared mimeType
- [ ] 7.3.7 Create `generateMediaKey(userId: string, filename: string): string` — returns `uploads/<userId>/<uuid>.<ext>`
- [ ] 7.3.8 Create `generatePresignedPutUrl(mediaKey: string, mimeType: string): Promise<string>` — calls `minioClient.presignedPutObject(bucket, mediaKey, 900)` (15 min = 900 sec)
- [ ] 7.3.9 Create `generatePresignedGetUrl(mediaKey: string): Promise<string>` — calls `minioClient.presignedGetObject(bucket, mediaKey, 3600)` (1 hour = 3600 sec)
- [ ] 7.3.10 Create `markDeleted(mediaKey: string): Promise<void>` — update `deleted: true` in DB
- [ ] 7.3.11 Create `deleteObject(mediaKey: string): Promise<void>` — calls `minioClient.removeObject(bucket, mediaKey)`

---

### 7.4 — Media Service — Business Logic

- [ ] 7.4.1 Create `requestPresignedUploadUrl(userId: string, dto: RequestPresignedUrlDto): Promise<{ uploadUrl: string; mediaKey: string; expiresAt: string }>`
  - Validate MIME type via whitelist
  - Validate size ≤ 100MB
  - Generate mediaKey
  - Save `Media` document to MongoDB (with `uploaderId`, `mimeType`, `size`, `conversationId`, `thumbnailKey: null`, `deleted: false`)
  - Generate presigned PUT URL (15 min)
  - Return `{ uploadUrl, mediaKey, expiresAt }`
- [ ] 7.4.2 Create `getPresignedDownloadUrl(userId: string, mediaKey: string): Promise<{ url: string; expiresAt: string }>`
  - Find `Media` by `mediaKey`
  - If not found → `NotFoundException`
  - If `deleted: true` → `NotFoundException`
  - If `conversationId` is set → check conversation membership via `ConversationsService`
  - If not a member → `ForbiddenException`
  - Generate presigned GET URL (1h)
  - Return `{ url, expiresAt }`
- [ ] 7.4.3 Create `deleteMedia(userId: string, mediaKey: string): Promise<void>`
  - Find `Media` by `mediaKey`
  - If not found → `NotFoundException`
  - If uploader is not `userId` → `ForbiddenException`
  - Set `deleted: true`, save
- [ ] 7.4.4 Create `saveThumbnail(mediaKey: string, thumbnailKey: string): Promise<void>` — update `Media.thumbnailKey`

---

### 7.5 — Media Controller

- [ ] 7.5.1 Create `src/media/media.controller.ts`
- [ ] 7.5.2 `POST /media/upload`: `@UseGuards(JwtAuthGuard)`, `@UsePipes(new ValidationPipe({ transform: true }))`, call `mediaService.requestPresignedUploadUrl(currentUser.id, dto)`, return 201
- [ ] 7.5.3 `GET /media/:mediaKey`: `@UseGuards(JwtAuthGuard)`, `@Param('mediaKey')`, call `mediaService.getPresignedDownloadUrl(currentUser.id, mediaKey)`, return 200
- [ ] 7.5.4 `DELETE /media/:mediaKey`: `@UseGuards(JwtAuthGuard)`, `@Param('mediaKey')`, call `mediaService.deleteMedia(currentUser.id, mediaKey)`, return 200
- [ ] 7.5.5 All endpoints: `@Public()` excluded (require JWT auth)
- [ ] 7.5.6 Swagger: add `@ApiTags('media')`, `@ApiOperation` descriptions for each endpoint

---

### 7.6 — Media Module

- [ ] 7.6.1 Create `src/media/media.module.ts`: import `MongooseModule.forFeature([{ name: Media.name, schema: MediaSchema }])`, `forwardRef(() => ConversationsModule)` (to access ConversationsService for membership check), export `MediaService`
- [ ] 7.6.2 Register in `AppModule`: add `MediaModule` to imports array

---

### 7.7 — Media Cron — Orphan Cleanup

- [ ] 7.7.1 Create `src/media-cron/media-cron.service.ts`
- [ ] 7.7.2 Inject `MediaModel` and `MinioClient` (import MediaService or create dedicated MinIO service reference)
- [ ] 7.7.3 Add `@Cron('0 3 * * *')` method `cleanupOrphanedMedia()`
- [ ] 7.7.4 Logic:
  1. Calculate `cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)` (30 days ago)
  2. Query: `Media.find({ deleted: true, createdAt: { $lt: cutoff } })`
  3. For each: `minioClient.removeObject(bucket, mediaKey)` → log on error
  4. After MinIO delete: `Media.deleteOne({ _id: media._id })`
  5. Log summary: `{ cleanedCount, errors }`
- [ ] 7.7.5 Create `src/media-cron/media-cron.module.ts`: imports `ScheduleModule`, `MongooseModule`, injects `MediaService`
- [ ] 7.7.6 Register in `AppModule`

---

### 7.8 — TypeScript Check

- [ ] 7.8.1 Run `npx tsc --noEmit` — fix any type errors
- [ ] 7.8.2 Run `npm run lint -- --fix` — fix any lint errors

---

### 7.9 — Verification Checklist

- [ ] 7.9.1 `POST /media/upload` — valid image returns presigned URL, file saved to MinIO after client PUT ✅
- [ ] 7.9.2 `POST /media/upload` — file > 100MB returns HTTP 400 ✅
- [ ] 7.9.3 `POST /media/upload` — unsupported MIME type returns HTTP 400 ✅
- [ ] 7.9.4 `GET /media/:mediaKey` — member of conversation gets presigned GET URL ✅
- [ ] 7.9.5 `GET /media/:mediaKey` — non-member returns HTTP 403 ✅
- [ ] 7.9.6 `GET /media/:mediaKey` — non-existent key returns HTTP 404 ✅
- [ ] 7.9.7 `DELETE /media/:mediaKey` — uploader marks as deleted ✅
- [ ] 7.9.8 `DELETE /media/:mediaKey` — non-uploader returns HTTP 403 ✅
- [ ] 7.9.9 Magic byte validation — mismatched file returns HTTP 400 ✅
- [ ] 7.9.10 MinIO unreachable — returns HTTP 503 ✅
