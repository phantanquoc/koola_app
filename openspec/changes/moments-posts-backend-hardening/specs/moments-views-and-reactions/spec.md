## MODIFIED Requirements

### Requirement: Comment-as-DM Bridge
The system SHALL deliver story comments as direct messages in the chat conversation between viewer and author, tagged with story-reply metadata. A post comment SHALL also trigger a push notification to the post author (unless the author is the commenter).

#### Scenario: Viewer sends a comment to author's story
- **WHEN** viewer calls `POST /moments/stories/:storyId/comments` with `{ content: "Đẹp quá!" }`
- **THEN** system finds or creates the direct conversation between `viewerId` and `authorId`, creates a message in that conversation with `{ type: "text", content: "Đẹp quá!", metadata: { storyReply: { storyId, mediaKeyPreview, captionSnippet } } }`, emits the standard `new_message` socket event to both participants, returns HTTP 200 with `{ messageId, conversationId }`

#### Scenario: Comment on a post notifies the post author
- **WHEN** a viewer (not the author) comments on a post
- **THEN** the post author receives a push notification with a `koola://moments/post/:postId` deep link, subject to the standard eligibility gates (disabled / offline / no-token / dedup)

#### Scenario: Author commenting on their own post sends no push
- **WHEN** the post author comments on their own post
- **THEN** no push notification is sent
