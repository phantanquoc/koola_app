## MODIFIED Requirements

### Requirement: Send Media Message
The system SHALL allow authenticated users to send image, file, and video messages by referencing a pre-uploaded media URL.

#### Scenario: Send image message
- **WHEN** user calls POST /conversations/:conversationId/messages with `{ type: "image", content: "", mediaUrl: "https://minio...", mediaMimeType: "image/jpeg", mediaSize: 2048000 }`
- **THEN** system stores message with type "image", broadcasts `new_message` to other participants

#### Scenario: Send file message
- **WHEN** user calls POST /conversations/:conversationId/messages with `{ type: "file", content: "report.pdf", mediaUrl: "...", mediaMimeType: "application/pdf", mediaSize: 52428800 }`
- **THEN** system stores message with type "file", broadcasts `new_message` to other participants

#### Scenario: Send video message
- **WHEN** user calls POST /conversations/:conversationId/messages with `{ type: "video", content: "", mediaUrl: "https://minio...", mediaMimeType: "video/mp4", mediaSize: 45000000, mediaDuration: 62 }`
- **THEN** system stores message with type "video" and optional mediaDuration field, broadcasts `new_message` to other participants

#### Scenario: Send file exceeding 200MB
- **WHEN** user attempts to send a media message (image, file, or video) with mediaSize > 209715200 bytes (200MB)
- **THEN** system returns HTTP 400 Bad Request with validation error "File exceeds 200MB limit"

#### Scenario: Send file with unsupported type
- **WHEN** user attempts to send a file with MIME type not in allowed list
- **THEN** system returns HTTP 400 Bad Request with validation error "File type not supported"
