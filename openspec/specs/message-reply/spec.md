# message-reply Specification

## Purpose
Allows authenticated conversation members to reply to a prior message in the same conversation. The reply carries a denormalized preview snapshot (sender, text excerpt, or media type) so all recipients see the quoted context without a separate fetch. The preview is immutable after send.

## Requirements
### Requirement: Reply to a message
The system SHALL allow an authenticated conversation member to send a message that references a prior message in the same conversation, carrying a preview snapshot end-to-end so recipients see the quoted context.

#### Scenario: Send reply with text preview
- **WHEN** user calls POST /conversations/:conversationId/messages with `{ type: "text", content: "agree", replyTo: "<sourceMessageId>" }` where source is a text message "We ship Friday"
- **THEN** server validates source belongs to same conversation and is not deleted, stores reply with `replyTo: <sourceId>` and `replyToPreview: { senderId: <source.senderId>, text: "We ship Friday" }`, broadcasts `new_message` containing both `replyTo` and `replyToPreview`

#### Scenario: Send reply with media preview
- **WHEN** user replies to an image message
- **THEN** server stores `replyToPreview: { senderId: <source.senderId>, mediaType: "image" }` with no `text` field

#### Scenario: Text preview exceeding 100 characters is truncated
- **WHEN** source message content is longer than 100 characters
- **THEN** `replyToPreview.text` SHALL be the first 100 characters of source content (no ellipsis added by server; client renders as it sees fit)

#### Scenario: Reply to message in a different conversation
- **WHEN** user sends a reply with `replyTo` pointing to a message in conversation B while writing in conversation A
- **THEN** server returns HTTP 400 Bad Request with error code `REPLY_CROSS_CONVERSATION`

#### Scenario: Reply to a message deleted for everyone
- **WHEN** source message has `deletedAt` set
- **THEN** server returns HTTP 400 Bad Request with error code `REPLY_SOURCE_DELETED`

#### Scenario: Reply to a message user has deleted for themselves
- **WHEN** source message's `deletedFor` array includes the caller's userId
- **THEN** server returns HTTP 400 Bad Request with error code `REPLY_SOURCE_DELETED_FOR_USER`

#### Scenario: Reply to a non-existent message
- **WHEN** `replyTo` ObjectId does not match any message
- **THEN** server returns HTTP 400 Bad Request with error code `REPLY_SOURCE_NOT_FOUND`

### Requirement: Reply preview is immutable after send
The system SHALL NOT retroactively update `replyToPreview` when the source message is later edited or deleted. The preview captures the source at the moment the reply was sent.

#### Scenario: Source message deleted for everyone after reply exists
- **WHEN** original message is soft-deleted (`deletedAt` set) AFTER a reply has been stored
- **THEN** existing replies still render with their original `replyToPreview`; no server action amends stored replies

### Requirement: Reply fields included in list, sync, and socket responses
The system SHALL include `replyTo` and `replyToPreview` fields in all message read endpoints and in `new_message` socket broadcasts, when present on the message.

#### Scenario: GET conversation messages
- **WHEN** client calls GET /conversations/:id/messages
- **THEN** each message response includes `replyTo` (string ObjectId) and `replyToPreview` (object with senderId, optional text, optional mediaType) when the message is a reply

#### Scenario: Socket broadcast on new reply
- **WHEN** server emits `new_message` for a reply message to a conversation room
- **THEN** the payload includes `replyTo` and `replyToPreview` fields in the same shape as REST responses

### Requirement: Mobile swipe-to-reply gesture
The mobile client SHALL provide a horizontal swipe gesture on message bubbles that enters reply-compose mode.

#### Scenario: Swipe own message to reply
- **WHEN** user swipes right-to-left on their own message bubble past the 60px threshold
- **THEN** the composer shows a ReplyPreview banner above the input referencing that message; the composer text input gains focus

#### Scenario: Swipe other user's message to reply
- **WHEN** user swipes left-to-right on another user's message bubble past the 60px threshold
- **THEN** the composer shows the same ReplyPreview banner with that message quoted

#### Scenario: Cancel reply before sending
- **WHEN** user taps the X button on the ReplyPreview banner
- **THEN** the banner disappears and subsequent sends do NOT include a `replyTo` field

### Requirement: Mobile reply preview rendering
The mobile client SHALL render a QuoteBubble at the top of any message that has `replyTo`, showing the original sender's display name and the preview text or a media-type label.

#### Scenario: Render text reply
- **WHEN** rendering a message with `replyToPreview: { senderId, text: "see you tomorrow" }`
- **THEN** the bubble includes a QuoteBubble region showing the resolved display name for `senderId` and the text "see you tomorrow"

#### Scenario: Render image reply
- **WHEN** rendering a message with `replyToPreview: { senderId, mediaType: "image" }`
- **THEN** the QuoteBubble shows the display name and a label "Hình anh" (or equivalent localized label)

#### Scenario: Tap quote to scroll to original
- **WHEN** user taps the QuoteBubble and the original message is currently loaded in the message list
- **THEN** the list scrolls to that message and flashes a brief highlight

#### Scenario: Tap quote when original not loaded
- **WHEN** user taps the QuoteBubble but the original is beyond the currently-paginated window
- **THEN** the client does NOT crash; it shows a toast "Khong tim thay tin nhan goc" or remains idle (behavior MAY be either; no loading-backward required)

