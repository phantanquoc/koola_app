## MODIFIED Requirements

### Requirement: Five Op Types with Versioned Payloads
The outbox SHALL support six op types: `send_message`, `react`, `delete`, `delete_for_me`, `mark_read`, and `create_post`. Each op type SHALL carry a `payload_version` (default 1) and a JSON-serialized payload whose shape is op-specific. `create_post` rows queued while offline MAY carry media attachments as local asset references; the dispatcher uploads each asset via presigned URL when online before creating the post, reusing the same `clientPostId` so replay stays idempotent.

#### Scenario: send_message payload shape (v1)
- **WHEN** a `send_message` row is enqueued
- **THEN** `payload_json` SHALL contain at minimum `{ content, type, clientMessageId }` and optionally `{ mediaUrl, mediaMimeType, mediaSize, mediaDuration, replyTo }`
- **AND** `dedup_key` SHALL be `NULL`
- **AND** `message_id` SHALL be `NULL`
- **AND** `conversation_id` SHALL be the target conversation id

#### Scenario: react payload shape (v1)
- **WHEN** a `react` row is enqueued
- **THEN** `payload_json` SHALL contain `{ messageId, emoji }` where `emoji` is a string or `null` (null indicates clear)
- **AND** `dedup_key` SHALL be the concatenation of `messageId + ':' + currentUserId`
- **AND** `message_id` SHALL be the target message id

#### Scenario: delete and delete_for_me payload shape (v1)
- **WHEN** a `delete` or `delete_for_me` row is enqueued
- **THEN** `payload_json` SHALL contain `{ messageId }`
- **AND** `dedup_key` SHALL be the message id
- **AND** `message_id` SHALL be the target message id

#### Scenario: mark_read payload shape (v1)
- **WHEN** a `mark_read` row is enqueued
- **THEN** `payload_json` SHALL contain `{ upToTimestamp: ISO_STRING }`
- **AND** `dedup_key` SHALL be the conversation id
- **AND** `message_id` SHALL be `NULL`

#### Scenario: create_post payload shape with media (v1)
- **WHEN** a `create_post` row is enqueued with 3 local photo URIs
- **THEN** `payload_json` SHALL contain `{ caption, audienceScope, audienceListId, mentions, clientPostId, media: [{ localUri, mediaType }] }`
- **AND** the dispatcher SHALL upload each asset when online and create the post with the stored `clientPostId`

#### Scenario: Offline media post publishes on reconnect without duplication
- **WHEN** a `create_post` row with media is dispatched after reconnect, the post is created, and the same row is retried after a lost response
- **THEN** exactly one post exists for that `clientPostId` (the server returns the existing post on replay)

#### Scenario: Unknown payload_version is rejected at dispatch
- **GIVEN** a row with `payload_version = N` where `N` exceeds the dispatcher's supported maximum
- **WHEN** the worker picks the row
- **THEN** the row SHALL be moved to `state='dead_letter'` with `last_error.code = 'UNSUPPORTED_VERSION'`
- **AND** the worker SHALL NOT call any handler
