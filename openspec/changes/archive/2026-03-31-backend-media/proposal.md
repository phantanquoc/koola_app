## Why

Media sharing is a core feature of the chat MVP. Users need to send images, files, audio, and video in conversations. Storing media in MongoDB (GridFS) is not recommended for files >16MB and adds load to the database. Cloud S3 incurs ongoing costs. MinIO on the existing Proxmox hardware provides S3-compatible storage at zero incremental cost, with presigned URLs enabling direct client-to-MinIO uploads that bypass the NestJS backend for large files.

## What Changes

This change adds the `media-storage` capability to the NestJS backend:

- **`POST /media/upload`**: Authenticated users request a presigned MinIO PUT URL. Server validates MIME type and size (≤100MB). Presigned URL expires in 15 minutes.
- **`GET /media/:mediaKey`**: Authenticated users request a presigned MinIO GET URL. Server verifies the requesting user is a member of the conversation that owns the media. Presigned GET URL expires in 1 hour.
- **`DELETE /media/:mediaKey`**: Soft-delete in MongoDB (`deleted: true`). A daily cron job permanently removes orphaned media files older than 30 days.
- **New `Media` MongoDB collection**: Stores metadata for every uploaded file (uploader, MIME type, size, conversation association, thumbnail key, deleted flag).
- **Magic byte validation**: Defense-in-depth MIME type check by inspecting file magic bytes on the server.
- **Orphan cleanup cron**: `@nestjs/schedule` daily job deletes unreferenced MinIO objects marked deleted >30 days ago.

## Capabilities

### New Capabilities

- `media-storage`: MinIO-backed media storage with presigned URL flow. Supports images, documents, spreadsheets, audio, video, archives up to 100MB. Authorization via conversation membership check.

### Modified Capabilities

- `messaging` (existing): Media messages already store `mediaUrl`, `mediaMimeType`, `mediaSize`. These fields now reference MinIO objects managed by the media module.
- `messages` schema: No schema change — media metadata stored in the new `Media` collection, linked by `mediaUrl` (MinIO object key).

## Impact

### Backend (NestJS)
- New `media` module: `MediaController`, `MediaService`, `MediaSchema`
- New `media-cron` module: daily orphan cleanup job
- MinIO SDK client singleton via `@nestjs/config`
- New env vars: `MINIO_PUBLIC_URL`
- New dependency: `@nestjs/schedule`

### External Dependencies
- MinIO: already provisioned on VM3, credentials in `.env`
