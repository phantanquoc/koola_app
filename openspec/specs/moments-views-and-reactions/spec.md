# moments-views-and-reactions Specification

## Purpose
TBD - created by archiving change moments-feature. Update Purpose after archive.
## Requirements
### Requirement: Record Story View
The system SHALL record a single view per `(storyId, viewerId)` pair, embedding the first ~200 viewer references on the root story document and overflowing subsequent views to a separate StoryViews collection.

#### Scenario: First view by a user is recorded
- **WHEN** authenticated user calls `POST /moments/stories/:storyId/views`
- **THEN** system writes a StoryView document with `{ storyGroupId, storyId, viewerId, viewedAt: now, expiresAt: story.expiresAt + 1h }`, increments the Redis counter `moments:story:<storyId>:views`, returns HTTP 200

#### Scenario: Duplicate view by same user
- **WHEN** the same user posts a view a second time
- **THEN** system catches the unique-index violation (E11000) and returns HTTP 200 without re-incrementing the counter

#### Scenario: View by author of the story
- **WHEN** the author of the story records a view of their own story
- **THEN** system stores the view but does NOT count the author in `viewCount`

#### Scenario: View on expired story
- **WHEN** viewer attempts to record a view on a story whose `expiresAt < now`
- **THEN** system returns HTTP 410 Gone

#### Scenario: View on inaccessible story
- **WHEN** viewer is not permitted by the story's audience scope
- **THEN** system returns HTTP 403

### Requirement: StoryViews Schema and Indexes
The system SHALL persist StoryViews with indexes that enforce dedupe, support "who viewed" queries, and auto-expire entries.

#### Scenario: Schema and indexes initialized
- **WHEN** the MomentsModule initializes
- **THEN** the StoryViews collection exists with fields `{ _id, storyGroupId, storyId, viewerId, viewedAt, expiresAt }` and indexes `{ storyGroupId: 1, viewerId: 1 }` `unique: true`, `{ storyGroupId: 1, viewedAt: -1 }`, `{ expiresAt: 1 }` with `expireAfterSeconds: 0`

### Requirement: View Count Aggregation via Redis Counter
The system SHALL maintain an approximate `viewCount` on the Story root document via a Redis counter incremented per view and flushed to MongoDB by a 60-second cron.

#### Scenario: Counter increments on view record
- **WHEN** a new view is recorded
- **THEN** Redis `INCR moments:story:<storyId>:views` is called

#### Scenario: Counter flushed every 60 seconds
- **WHEN** the cron job runs
- **THEN** for every key matching `moments:story:*:views`, the system reads the current counter value, sets `Stories.viewCount += <value>`, and decrements the Redis counter by the flushed amount atomically

#### Scenario: Counter survives backend restart
- **WHEN** the backend restarts mid-flush window
- **THEN** Redis retains pending increments; the next cron flush includes them

#### Scenario: Counter flush is idempotent on partial failure
- **WHEN** a flush fails after Mongo update but before Redis decrement
- **THEN** the next flush re-applies the same increment, accepted as best-effort approximation; StoryViews collection remains the audit source of truth

### Requirement: Author "Who Viewed" Endpoint
The system SHALL allow the story's author to retrieve the ordered list of viewers.

#### Scenario: Author lists viewers
- **WHEN** author calls `GET /moments/stories/:storyId/viewers?cursor=<viewedAt>&limit=50`
- **THEN** system returns up to 50 viewer entries `{ viewerId, viewedAt, displayName, avatarUrl }` sorted by `viewedAt DESC`, with `nextCursor` for pagination

#### Scenario: Non-author requests viewers
- **WHEN** a non-author calls the endpoint
- **THEN** system returns HTTP 403

#### Scenario: Author of expired story still queries viewers
- **WHEN** author queries viewers of a story where `expiresAt < now` but the StoryViews entries have not yet been TTL'd
- **THEN** system returns the surviving entries

#### Scenario: Empty viewer list
- **WHEN** the story has zero viewers
- **THEN** system returns `{ viewers: [], nextCursor: null }` and `viewCount: 0`

### Requirement: Story Reactions
The system SHALL allow each viewer to react with exactly one emoji per story; re-reacting overwrites the previous emoji.

#### Scenario: First reaction by a viewer
- **WHEN** viewer calls `POST /moments/stories/:storyId/reactions` with `{ emoji: "😂" }`
- **THEN** system appends `{ userId: viewerId, emoji: "😂", createdAt: now }` to the story's `reactions` array, emits `story.reaction` to the author's user-room with `{ storyId, viewerId, emoji }`, returns HTTP 200

#### Scenario: Re-reaction by same viewer
- **WHEN** viewer reacts again with a different emoji
- **THEN** system replaces the existing entry for that `userId` (single update operator: `$pull` then `$push`); the array still contains exactly one entry per `userId`

#### Scenario: Reaction with unsupported emoji
- **WHEN** the emoji is not in the allowed set `{ ❤️, 😂, 😮, 😢, 😡, 👏, 🔥 }`
- **THEN** system returns HTTP 400 with `"Unsupported reaction emoji"`

#### Scenario: Remove reaction
- **WHEN** viewer calls `DELETE /moments/stories/:storyId/reactions`
- **THEN** system removes the viewer's reaction entry, returns HTTP 200; if the viewer had no reaction, returns HTTP 200 (idempotent)

#### Scenario: Reaction on inaccessible story
- **WHEN** viewer is not permitted by the audience scope
- **THEN** system returns HTTP 403

### Requirement: Story Reaction Aggregation
The system SHALL surface aggregated reaction counts per emoji for the author and any viewer in scope.

#### Scenario: Aggregated counts in story read
- **WHEN** caller fetches a single story
- **THEN** the response includes `reactionCounts: { "😂": 3, "❤️": 7, ... }` and `myReaction: "😂" | null`

### Requirement: Comment-as-DM Bridge
The system SHALL deliver story comments as direct messages in the chat conversation between viewer and author, tagged with story-reply metadata.

#### Scenario: Viewer sends a comment to author's story
- **WHEN** viewer calls `POST /moments/stories/:storyId/comments` with `{ content: "Đẹp quá!" }`
- **THEN** system finds or creates the direct conversation between `viewerId` and `authorId`, creates a message in that conversation with `{ type: "text", content: "Đẹp quá!", metadata: { storyReply: { storyId, mediaKeyPreview, captionSnippet } } }`, emits the standard `new_message` socket event to both participants, returns HTTP 200 with `{ messageId, conversationId }`

#### Scenario: Viewer sends comment when no conversation exists
- **WHEN** there is no existing direct conversation
- **THEN** system creates one as a side effect (using existing ConversationsService) before posting the message

#### Scenario: Comment on inaccessible story
- **WHEN** viewer is not permitted by the audience scope
- **THEN** system returns HTTP 403 and no conversation is created

#### Scenario: Comment exceeding length
- **WHEN** comment text > 1000 characters
- **THEN** system returns HTTP 400

#### Scenario: Author commenting on their own story
- **WHEN** the caller is the story's author
- **THEN** system returns HTTP 400 with `"Cannot comment on own story"`

#### Scenario: Story comment metadata renders as story-reference card on chat side
- **WHEN** the chat client receives a message with `metadata.storyReply`
- **THEN** the message bubble displays a `StoryReferenceCard` (thumbnail + caption snippet) above the comment text

