## ADDED Requirements

### Requirement: Send Reply Message
The system SHALL allow an authenticated conversation member to send a message that references a prior message in the same conversation via an optional `replyTo` field.

#### Scenario: Send reply to a text message
- **WHEN** user calls POST /conversations/:conversationId/messages with `{ type: "text", content: "ok", replyTo: "<sourceMessageId>" }` where source is in the same conversation and not deleted
- **THEN** server stores the reply with `replyTo` and a denormalized `replyToPreview: { senderId, text? (trimmed to 100 chars), mediaType? }`, emits `new_message` with both fields included in the payload

#### Scenario: Reply with text source — preview contains truncated text
- **WHEN** source message `content` has 250 characters
- **THEN** `replyToPreview.text` is the first 100 characters of `content`; `replyToPreview.mediaType` is absent

#### Scenario: Reply with media source — preview contains mediaType only
- **WHEN** source message is type `image`
- **THEN** `replyToPreview.mediaType = "image"`; `replyToPreview.text` is absent

#### Scenario: Reply to deleted-for-everyone message
- **WHEN** source message has `deletedAt` truthy
- **THEN** server returns HTTP 400 Bad Request (error code `REPLY_SOURCE_DELETED`)

#### Scenario: Reply to message in different conversation
- **WHEN** `replyTo` references a message whose `conversationId` differs from the caller's target conversation
- **THEN** server returns HTTP 400 Bad Request (error code `REPLY_CROSS_CONVERSATION`)

#### Scenario: Reply to non-existent message
- **WHEN** `replyTo` is a valid ObjectId but no message with that id exists
- **THEN** server returns HTTP 400 Bad Request (error code `REPLY_SOURCE_NOT_FOUND`)

#### Scenario: Reply to message user has deleted-for-self
- **WHEN** source message's `deletedFor` array contains the caller's userId
- **THEN** server returns HTTP 400 Bad Request (error code `REPLY_SOURCE_DELETED_FOR_USER`)

## MODIFIED Requirements

### Requirement: Send Media Message
The system SHALL allow authenticated users to send image, video, and file messages by referencing a pre-uploaded media URL. Video messages SHALL include `mediaThumbnailKey` (server-generated thumbnail object key in MinIO) in read responses and socket broadcasts so clients can render thumbnails without fetching the video.

#### Scenario: Send image message
- **WHEN** user calls POST /conversations/:conversationId/messages with `{ type: "image", content: "", mediaUrl: "https://minio...", mediaMimeType: "image/jpeg", mediaSize: 2048000 }`
- **THEN** system stores message with type "image", broadcasts `new_message` to other participants

#### Scenario: Send file message
- **WHEN** user calls POST /conversations/:conversationId/messages with `{ type: "file", content: "report.pdf", mediaUrl: "...", mediaMimeType: "application/pdf", mediaSize: 52428800 }`
- **THEN** system stores message with type "file", broadcasts `new_message` to other participants

#### Scenario: Send file exceeding 100MB
- **WHEN** user attempts to send a file message with mediaSize > 104857600 bytes
- **THEN** system returns HTTP 400 Bad Request with validation error "File exceeds 100MB limit"

#### Scenario: Send file with unsupported type
- **WHEN** user attempts to send a file with MIME type not in allowed list
- **THEN** system returns HTTP 400 Bad Request with validation error "File type not supported"

#### Scenario: Video message response includes thumbnail key
- **WHEN** client reads a video message via GET /conversations/:id/messages or receives one via `new_message` socket event
- **THEN** the message payload includes `mediaThumbnailKey` (string) when present on the server document, so the client can render the thumbnail without additional requests
