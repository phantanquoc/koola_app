## ADDED Requirements

### Requirement: Story Reply Metadata
The system SHALL allow a message to carry an optional `storyReply` metadata block referencing a story; the chat client renders such messages with a story-reference card.

#### Scenario: Message created via story comment endpoint includes storyReply
- **WHEN** the moments service creates a message via the comment-as-DM bridge with `metadata: { storyReply: { storyId, mediaKeyPreview, captionSnippet } }`
- **THEN** the message persists with the metadata, the standard `new_message` socket event is broadcast, and chat clients render the bubble with a `StoryReferenceCard` (thumbnail + caption snippet) above the message text

#### Scenario: Story reply targets active story
- **WHEN** the chat client receives a message with `storyReply` metadata and taps the card
- **THEN** the client navigates to the story viewer for `storyReply.storyId`; if the story has expired or been deleted, the viewer shows "Khoảnh khắc không còn khả dụng"

#### Scenario: Direct message creation rejects manually-supplied storyReply metadata
- **WHEN** a regular `POST /conversations/:conversationId/messages` call includes `metadata.storyReply` in its body
- **THEN** the server strips the field; only the moments comment endpoint is permitted to set `storyReply` metadata

#### Scenario: Story reply on expired story still renders the card
- **WHEN** the chat history shows a message whose `storyReply.storyId` no longer exists
- **THEN** the card renders with the cached `mediaKeyPreview` and `captionSnippet` and shows a "đã hết hạn" indicator; tapping the card opens the same expired-state view
