## Architecture

### Overview

```
React Native                    NestJS Backend                  MinIO (VM3)
     │                              │                              │
     │  POST /media/upload         │                              │
     │  {filename, mimeType,      │                              │
     │   size, conversationId?}────▶  Validate + Generate         │
     │                              │  presigned PUT URL ─────────▶│
     │                              │                              │
     │◀─ { uploadUrl, mediaKey } ──┘                              │
     │                              │                              │
     │  PUT <uploadUrl>             │                              │
     │  (direct upload) ─────────────────────────────────────────▶│
     │                              │                              │
     │  POST /messages              │                              │
     │  { mediaUrl: mediaKey,       │                              │
     │    mediaMimeType,            │                              │
     │    mediaSize }               │                              │
     │                              │                              │
     │  GET /media/:mediaKey        │                              │
     │◀─────────────────────────── │  Check conv membership        │
     │  { url: presignedGET }      │  Generate presigned GET ─────▶│
     │                              │                              │
     │  DELETE /media/:mediaKey     │                              │
     │──────────────────────────────▶  Mark deleted: true          │
     │                              │                              │
     │                    Daily Cron (orphan cleanup)              │
     │                    DELETE objects where deleted=true         │
     │                    AND createdAt < now-30d ─────────────────▶│
```

### File Structure

```
src/
  media/
    media.module.ts          — imports: MongooseModule, ConfigModule
    media.controller.ts      — REST endpoints
    media.service.ts         — MinIO client, URL generation, validation
    media.schema.ts          — MongoDB schema
    dto/
      request-presigned-url.dto.ts   — upload request DTO
  media-cron/
    media-cron.module.ts     — imports: ScheduleModule.forRoot()
    media-cron.service.ts   — @Cron('0 3 * * *') daily orphan cleanup
```

### Media Schema

```typescript
@Schema({ timestamps: true })
export class Media {
  @Prop({ required: true, unique: true })            mediaKey: string;      // MinIO object key, e.g. "uploads/<userId>/<uuid>.jpg"
  @Prop({ required: true })                          uploaderId: string;    // user._id
  @Prop({ required: true })                          mimeType: string;
  @Prop({ required: true })                          size: number;         // bytes
  @Prop({ default: false })                         deleted: boolean;
  @Prop({ type: String, default: null })            thumbnailKey: string | null;
  @Prop({ type: String, default: null })            conversationId: string | null; // for access check
  @Prop({ type: String, default: null })            messageId: string | null;       // optional link to message
}
```

**Indexes:**
- `mediaKey` — unique
- `uploaderId` — for user's media listing
- `conversationId` — for media-by-conversation queries
- `deleted + createdAt` — for orphan cleanup

### Presigned URL Format

**Upload key pattern:** `uploads/<userId>/<uuid>.<ext>`
- Example: `uploads/678a1b2c3d4e5f/upload_abc123.jpg`

**Thumbnail key pattern:** `thumbnails/<userId>/<uuid>_thumb.<ext>`
- Example: `thumbnails/678a1b2c3d4e5f/upload_abc123_thumb.jpg`

### Supported MIME Types (whitelist)

| Category | Types |
|---|---|
| Images | `image/jpeg`, `image/png`, `image/gif`, `image/webp` |
| Documents | `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| Spreadsheets | `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| Audio | `audio/mpeg`, `audio/ogg`, `audio/wav` |
| Video | `video/mp4`, `video/quicktime`, `video/webm` |
| Archives | `application/zip`, `application/x-rar-compressed` |

### Magic Byte Validation

File magic bytes are checked server-side as defense-in-depth (not just trusting client MIME type):

| Type | Magic Bytes (hex) |
|---|---|
| JPEG | `FF D8 FF` |
| PNG | `89 50 4E 47` |
| GIF | `47 49 46 38` |
| WebP | `52 49 46 46 ... 57 45 42 50` |
| PDF | `25 50 44 46` |
| ZIP | `50 4B 03 04` |
| MP3 | `FF FB` or `FF F3` or `FF F2` |
| MP4 | `00 00 00` followed by `66 74 79 70` |
| OGG | `4F 67 67 53` |

### API Endpoints

#### `POST /media/upload`

**Request:**
```json
{
  "filename": "photo.jpg",
  "mimeType": "image/jpeg",
  "size": 2048000,
  "conversationId": "678a1b2c3d4e5f"  // optional
}
```

**Response (201):**
```json
{
  "uploadUrl": "http://localhost:9000/chat-media/uploads/.../photo.jpg?...",
  "mediaKey": "uploads/678a/abc123.jpg",
  "expiresAt": "2026-03-31T10:15:00Z"
}
```

**Errors:**
- `400`: `File size exceeds 100MB limit`
- `400`: `File type not supported`
- `400`: `Invalid conversationId` (if provided)

#### `GET /media/:mediaKey`

**Response (200):**
```json
{
  "url": "http://localhost:9000/chat-media/uploads/.../photo.jpg?...",
  "expiresAt": "2026-03-31T11:00:00Z"
}
```

**Errors:**
- `404`: Media not found
- `403`: User not authorized to access this media

#### `DELETE /media/:mediaKey`

**Response (200):**
```json
{ "deleted": true }
```

**Errors:**
- `404`: Media not found
- `403`: Only uploader can delete

### Conversation Membership Check

For `GET /media/:mediaKey`:
1. Look up `Media` document by `mediaKey`
2. If `conversationId` is null → allow (avatar/general upload)
3. If `conversationId` is set → check if requesting user is a member of that conversation
4. If not a member → `403 Forbidden`

### Orphan Cleanup Cron

**Schedule:** Daily at 3:00 AM (`@Cron('0 3 * * *')`)

**Logic:**
1. Query: `{ deleted: true, createdAt: { $lt: 30_days_ago } }`
2. For each result: call `minioClient.removeObject(bucket, mediaKey)`
3. Delete MongoDB document after MinIO delete succeeds
4. Log: total cleaned, errors

### Error Handling

| Scenario | Behavior |
|---|---|
| MinIO unreachable | Log error, return `503 Service Unavailable` |
| Presigned URL generation fails | Return `500 Internal Server Error` |
| File not found in MinIO on cleanup | Log warning, delete MongoDB record anyway |
| Concurrent cleanup + active upload same key | MinIO atomic delete, no race condition |
