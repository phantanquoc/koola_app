# backend-media — Breakdown

## Fog Points & Resolutions

### Fog 1: Media metadata storage
**Question:** Cần Media collection riêng hay lưu trong Message?
**Resolution:** Tạo `Media` collection riêng trong MongoDB.
**Rationale:** Clean separation, supports soft-delete + orphan cleanup. Spec implies metadata exists (has `deleted: true` field).

### Fog 2: Avatar upload — cùng endpoint hay riêng?
**Question:** Avatar dùng chung `POST /media/upload` hay endpoint riêng?
**Resolution:** Dùng chung `POST /media/upload`.
**Rationale:** DRY, client handles what to do with the returned key.

### Fog 3: Thumbnail generation
**Question:** Spec nói "server SHALL store thumbnails" nhưng non-goals nói "no server-side preview generation".
**Resolution:** Client generates thumbnail. Server chỉ lưu `mediaThumbnailKey` trong Media metadata.
**Rationale:** Spec scenario says "client uploads thumbnail separately using the same presigned URL flow" — consistent with client-side thumbnail generation.

### Fog 4: Orphan cleanup
**Question:** Background job hay manual trigger?
**Resolution:** `@nestjs/schedule` + `@Cron('0 3 * * *')` daily job.
**Rationale:** Self-hosted friendly, set-and-forget. Delete `{ deleted: true, createdAt < now-30d }`.

### Fog 5: File type validation
**Question:** Trust client MIME type hay server-side magic byte check?
**Resolution:** Both — magic byte validation as defense-in-depth.
**Rationale:** Defense in depth. Client sends mimeType in DTO, server checks magic bytes to verify.

### Fog 6: Presigned URL expiry
**Question:** Hard-code 15 min hay configurable?
**Resolution:** Hard-code 15 min (900 seconds) — as spec.
**Rationale:** No need to over-engineer. 15 min is reasonable.

## Architecture Decisions

- **MinIO client:** Singleton via plain module-level `const client = new Minio.Client(...)`
- **Bucket init:** Check + create on `MediaModule.onModuleInit()`
- **Cron:** Separate `MediaCronModule` + `MediaCronService`
- **Conversation membership check:** Import `ConversationsModule` via `forwardRef()`
- **Magic bytes:** Stored in `SUPPORTED_MIME_TYPES` constant + `MAGIC_BYTES_MAP` in service

## Schema

```typescript
Media {
  mediaKey: string (unique)
  uploaderId: string
  mimeType: string
  size: number
  deleted: boolean (default: false)
  thumbnailKey: string | null
  conversationId: string | null
  messageId: string | null
  createdAt, updatedAt (timestamps)
}
```

Indexes: `mediaKey` (unique), `uploaderId`, `conversationId`, `deleted+createdAt`

## Edge Cases

| Edge Case | Handling |
|---|---|
| Upload > 100MB | HTTP 400 `File size exceeds 100MB limit` |
| Unsupported MIME | HTTP 400 `File type not supported` |
| Magic bytes mismatch | HTTP 400 `File content does not match declared MIME type` |
| Presigned URL expired | MinIO returns 403, client requests new URL |
| Get media, not in conversation | HTTP 403 Forbidden |
| Media key not found | HTTP 404 NotFoundException |
| Delete by non-uploader | HTTP 403 Forbidden |
| MinIO unreachable | HTTP 503 `Storage service unavailable` |
| Concurrent cleanup + active media | MinIO atomic delete, no race |

## Files to Create

```
src/media/
  media.module.ts
  media.controller.ts
  media.service.ts
  media.schema.ts
  dto/
    request-presigned-url.dto.ts
src/media-cron/
  media-cron.module.ts
  media-cron.service.ts
```

## Env Additions

```
MINIO_PUBLIC_URL=http://localhost:9000
```

## Dependencies

- `@nestjs/schedule` — new
- `minio` — already in package.json ✅
