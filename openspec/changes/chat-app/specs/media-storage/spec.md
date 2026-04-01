## ADDED Requirements

### Requirement: Presigned URL Generation
The system SHALL generate short-lived presigned URLs for direct client-to-MinIO uploads.

#### Scenario: Request presigned URL for image
- **WHEN** authenticated user calls POST /media/upload with `{ filename: "photo.jpg", mimeType: "image/jpeg", size: 2048000 }`
- **THEN** server validates size ≤ 100MB, generates MinIO presigned PUT URL with 15-minute expiry, returns `{ uploadUrl: "...", mediaKey: "uploads/<userId>/<uuid>.jpg" }`

#### Scenario: Request presigned URL exceeding 100MB
- **WHEN** authenticated user requests presigned URL for a file larger than 104857600 bytes
- **THEN** server returns HTTP 400 Bad Request with validation error "File size exceeds 100MB limit"

#### Scenario: Request presigned URL with unsupported MIME type
- **WHEN** authenticated user requests presigned URL for an unsupported MIME type
- **THEN** server returns HTTP 400 Bad Request with validation error "File type not supported"

### Requirement: Supported File Types
The system SHALL support the following MIME types:

- Images: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- Documents: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- Spreadsheets: `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Audio: `audio/mpeg`, `audio/ogg`, `audio/wav`
- Video: `video/mp4`, `video/quicktime`, `video/webm`
- Archives: `application/zip`, `application/x-rar-compressed`

### Requirement: Direct Client Upload
The system SHALL allow the React Native client to upload files directly to MinIO using the presigned URL.

#### Scenario: Successful direct upload
- **WHEN** client PUTs the file to the presigned URL within the 15-minute window
- **THEN** MinIO stores the file, returns HTTP 200; client then calls `POST /messages` with `mediaUrl` reference

#### Scenario: Upload after URL expired
- **WHEN** client attempts to PUT after 15 minutes
- **THEN** MinIO returns HTTP 403 Forbidden; client must request a new presigned URL

### Requirement: Media Retrieval URL
The system SHALL generate presigned GET URLs for retrieving private media.

#### Scenario: Get media URL
- **WHEN** authenticated user calls GET /media/:mediaKey
- **THEN** server generates MinIO presigned GET URL with 1-hour expiry, returns `{ url: "..." }`

#### Scenario: Get media for non-participant
- **WHEN** user who is not a member of the message's conversation requests media URL
- **THEN** server returns HTTP 403 Forbidden

### Requirement: Media Cleanup
The system SHALL delete orphaned media files that are not referenced by any message.

#### Scenario: Cleanup on message deletion
- **WHEN** a media message is deleted
- **THEN** system marks media as `deleted: true` in media metadata collection; a background job deletes unreferenced media files older than 30 days

### Requirement: Thumbnail Generation
The system SHALL store thumbnails for image uploads.

#### Scenario: Thumbnail for image
- **WHEN** client uploads an image and includes `generateThumbnail: true` in the upload request
- **THEN** client uploads thumbnail separately using the same presigned URL flow; thumbnail key is stored as `mediaThumbnailKey` on the message
