# moments-stories Specification

## Purpose
TBD - created by archiving change moments-feature. Update Purpose after archive.
## Requirements
### Requirement: Story Creation
The system SHALL allow authenticated users to create a story consisting of exactly one image or one video, an optional caption (≤ 500 characters) with @mentions, an optional music track reference, and an audience scope. The composer accepts both image and video assets via a unified mixed-mode picker, with a 60-second client-side cap on video duration.

#### Scenario: Create image story with public scope
- **WHEN** authenticated user calls `POST /moments/stories` with `{ mediaKey, mediaType: "image", caption?: string, audienceScope: "public" }`
- **THEN** system creates a Story document with `expiresAt = createdAt + 24h`, `viewCount = 0`, `isActive = true`, returns the created story, emits `story.new` to the user-room of every viewer permitted by the public scope, and triggers FCM push for any mentioned users that pass the privacy filter

#### Scenario: Create video story with connections-only scope
- **WHEN** user calls `POST /moments/stories` with `{ mediaKey, mediaType: "video", duration: 12, audienceScope: "connections" }`
- **THEN** system creates the story, emits `story.new` only to user-rooms of users who are connections of the author at creation time

#### Scenario: Composer opens picker in mixed mode
- **WHEN** the user taps "Chọn ảnh / video" in the composer
- **THEN** the composer opens `launchImageLibrary` with `mediaType: 'mixed'` and `videoQuality: 'medium'`, allowing both image and video selection. The 60-second cap is enforced client-side after selection (not via picker option) because `durationLimit` is only available on `launchCamera`/`CameraOptions` in `react-native-image-picker@8.x`, not on `launchImageLibrary`/`ImageLibraryOptions`.

#### Scenario: Composer detects asset type and sets DTO mediaType correctly
- **WHEN** the picker returns an asset whose MIME type starts with `video/`
- **THEN** the composer sets the DTO `mediaType = 'video'` and includes the asset's duration field; when the MIME type is image-like, the composer sets `mediaType = 'image'` and omits the duration field

#### Scenario: Composer rejects video over 60 seconds before upload
- **WHEN** the picker returns a video asset whose duration > 60 seconds
- **THEN** the composer surfaces an inline error "Video dài quá 60 giây" and does not call `POST /moments/stories`

#### Scenario: Composer hint text reflects mixed support
- **WHEN** the composer is in the media-picker step
- **THEN** the helper text under the picker button reads "Ảnh hoặc video tối đa 60 giây"

#### Scenario: Create story with custom audience list
- **WHEN** user calls `POST /moments/stories` with `{ mediaKey, mediaType: "image", audienceScope: "custom", audienceListId: "<listId>" }` and `audienceListId` references an AudienceList owned by the author
- **THEN** system creates the story with that `audienceListId` and emits `story.new` only to user-rooms of users in that list's `memberIds`

#### Scenario: Create story with custom scope without audienceListId
- **WHEN** user calls `POST /moments/stories` with `audienceScope: "custom"` and no `audienceListId`
- **THEN** system returns HTTP 400 with `"audienceListId is required for custom scope"`

#### Scenario: Create story with audienceListId not owned by author
- **WHEN** user supplies an `audienceListId` whose `ownerId` is not the caller
- **THEN** system returns HTTP 403

#### Scenario: Create story with caption exceeding 500 chars
- **WHEN** caption length > 500 characters
- **THEN** system returns HTTP 400 with validation error

#### Scenario: Create story with mediaKey not owned by uploader
- **WHEN** the referenced `mediaKey` was uploaded by a different user
- **THEN** system returns HTTP 403

#### Scenario: Create story with unsupported media type
- **WHEN** `mediaType` is not in `{ "image", "video" }`
- **THEN** system returns HTTP 400

#### Scenario: Create video story exceeding 60 seconds
- **WHEN** `mediaType` is `"video"` and `duration > 60`
- **THEN** system returns HTTP 400 with `"Video story exceeds 60 second limit"`

### Requirement: Story Schema and Outlier Pattern
The system SHALL persist stories using the Outlier pattern: a root Story document holds the first ~200 viewer entries; subsequent viewers overflow to the StoryViews collection, with both linked by a shared `storyGroupId`.

#### Scenario: Schema fields and indexes
- **WHEN** the MomentsModule initializes
- **THEN** the Stories collection exists with fields `{ _id, storyGroupId, overFlowIndex, authorId, mediaKey, mediaType, thumbnailKey?, duration?, caption, mentions, musicRef?, audienceScope, audienceListId?, reactions, viewCount, hasOverflow, createdAt, expiresAt, isActive }` and indexes `{ authorId: 1, createdAt: -1 }`, `{ expiresAt: 1 }` with `expireAfterSeconds: 0` and `partialFilterExpression: { expiresAt: { $exists: true, $ne: null } }`, `{ storyGroupId: 1, overFlowIndex: 1 }`, `{ audienceListId: 1 }`

#### Scenario: New story root document has overFlowIndex 1
- **WHEN** a story is created
- **THEN** the root Story document has `overFlowIndex = 1`, `storyGroupId = _id`, `hasOverflow = false`

### Requirement: 24-Hour TTL Expiry
The system SHALL automatically remove story documents 24 hours after creation via a MongoDB TTL index, except when `expiresAt` is null (Highlights).

#### Scenario: Story expires after 24 hours
- **WHEN** 24 hours pass since `createdAt` and the story has `expiresAt > 0`
- **THEN** MongoDB TTL deletes the document within ~60 seconds of expiry

#### Scenario: Highlight story is exempt from TTL
- **WHEN** a story has `expiresAt: null`
- **THEN** the partial filter excludes it from the TTL index and the document is never auto-deleted

#### Scenario: Feed query rejects stale story between TTL fire delay
- **WHEN** a story's `expiresAt` is in the past but the document has not yet been deleted
- **THEN** feed query MUST filter `expiresAt > now` so the stale story is not returned

### Requirement: Feed Query with 3-Tier Privacy
The system SHALL return a viewer's story feed scoped by `public` / `connections` / `custom` audience filters in a single query without N+1 cost. For the `connections` scope, the connection graph for v1 is derived from DIRECT conversations: two users are "connected" if they share at least one conversation of `type='direct'`. Each feed item SHALL include the author's `displayName` and `avatar` fields so clients can render the author identity without an extra round-trip.

#### Scenario: Feed returns public stories
- **WHEN** authenticated user calls `GET /moments/feed`
- **THEN** system returns active stories where `audienceScope = "public"` from any author the viewer has not blocked, sorted by `createdAt DESC`, grouped by author

#### Scenario: Feed returns connections-only stories from connected authors
- **WHEN** viewer shares at least one DIRECT conversation with author A and A has a `"connections"` story
- **THEN** that story appears in the viewer's feed

#### Scenario: Feed excludes connections-only story from non-connection
- **WHEN** viewer shares NO DIRECT conversation with author A and A has a `"connections"` story
- **THEN** that story does NOT appear in the viewer's feed

#### Scenario: Viewer always sees own connections-only stories
- **WHEN** viewer is the author of a `"connections"` story
- **THEN** that story appears in the viewer's feed regardless of the viewer's own connection set

#### Scenario: Feed includes custom-scope story when viewer is in the list
- **WHEN** author A's story is `"custom"` with `audienceListId = L`, and viewer is in `L.memberIds`
- **THEN** that story appears in the viewer's feed

#### Scenario: Feed excludes custom-scope story when viewer is not in the list
- **WHEN** viewer is not in the referenced AudienceList's `memberIds`
- **THEN** that story does NOT appear

#### Scenario: Feed groups stories by author with unviewed-first ordering
- **WHEN** viewer requests the feed
- **THEN** authors with unviewed stories sort before authors whose stories the viewer has already viewed; within an author, stories sort by `createdAt ASC` for in-order playback

#### Scenario: Feed item carries author identity for ring rendering
- **WHEN** any feed item is returned
- **THEN** the item SHALL include `authorDisplayName: string` (from the author's `User.displayName`, empty string if the user is missing) and `authorAvatar: string | null` (from the author's `User.avatar`, null if absent), in addition to existing fields `{ authorId, lastStoryId, hasUnviewed, stories }`

#### Scenario: Feed pagination
- **WHEN** viewer passes `?cursor=<authorId>&limit=20`
- **THEN** system returns the next 20 author groups after the cursor

### Requirement: Story Read by Story ID
The system SHALL return a single story for playback if the viewer is permitted by its audience scope. For the `connections` scope, permission is granted only when the viewer shares at least one DIRECT conversation with the author or the viewer IS the author.

#### Scenario: Authorized viewer reads story
- **WHEN** viewer calls `GET /moments/stories/:storyId` and is permitted by the story's audience scope
- **THEN** system returns the story including `mediaKey`, `caption`, `mentions`, `musicRef`, `viewCount` (best-effort, may lag up to 60s), and a presigned media URL valid for 1 hour

#### Scenario: Connections-scope story rejected for non-connection viewer
- **WHEN** viewer is not the author and shares NO DIRECT conversation with the author of a `"connections"` story
- **THEN** system returns HTTP 403

#### Scenario: Connections-scope story allowed for connection viewer
- **WHEN** viewer shares at least one DIRECT conversation with the author of a `"connections"` story
- **THEN** system returns the story

#### Scenario: Author always reads own story
- **WHEN** the viewer is the author of the story
- **THEN** system returns the story regardless of audience scope

#### Scenario: Unauthorized viewer
- **WHEN** viewer is not permitted by the audience scope
- **THEN** system returns HTTP 403

#### Scenario: Expired story
- **WHEN** the story's `expiresAt < now`
- **THEN** system returns HTTP 410 Gone

### Requirement: Soft and Hard Story Deletion
The system SHALL allow the author to delete their own story; the document is soft-flagged immediately and hard-deleted by TTL.

#### Scenario: Author deletes own story
- **WHEN** author calls `DELETE /moments/stories/:storyId`
- **THEN** system sets `isActive = false`, returns HTTP 200, emits `story.deleted` to viewer user-rooms; the document remains in the collection until TTL fires for audit purposes

#### Scenario: Non-author attempts deletion
- **WHEN** a non-author calls delete
- **THEN** system returns HTTP 403

### Requirement: MinIO Lifecycle for Story Media
The system SHALL apply a 25-hour object lifecycle policy to MinIO objects under the `stories/` prefix to clean up media even if the Mongo TTL fails.

#### Scenario: Story media is auto-removed after 25 hours
- **WHEN** an object under `stories/<storyId>/<key>` reaches 25 hours of age
- **THEN** MinIO deletes the object via lifecycle policy

#### Scenario: Highlight media stored in different prefix
- **WHEN** a story is promoted to a Highlight
- **THEN** the media is moved to `highlights/<userId>/<storyId>/<key>` which has no lifecycle policy

### Requirement: @mention Parsing and Privacy-Aware Notification
The system SHALL parse @mentions from the caption into a structured array and send notifications gated by the mentioner's privacy setting.

#### Scenario: Caption with valid mentions parsed
- **WHEN** caption contains `@username` tokens that match existing users
- **THEN** the story's `mentions` array is populated with `{ userId, username, offset, length }` for each match

#### Scenario: Mention notification when mentioner is public
- **WHEN** mentioner has `isPrivate = false` and a user is mentioned
- **THEN** system emits `story.mention` to the mentioned user's user-room and queues an FCM push with deep-link `koola://moments/story/<storyId>`

#### Scenario: Mention notification when mentioner is private and connected
- **WHEN** mentioner has `isPrivate = true`, mentioned user is a connection of the mentioner
- **THEN** notification is sent

#### Scenario: Mention notification suppressed for private mentioner / non-connection
- **WHEN** mentioner is private AND mentioned user is NOT a connection
- **THEN** NO notification is sent (silently suppressed); the mention is still recorded in the story document

#### Scenario: Mention of non-existent username
- **WHEN** caption contains `@notarealuser` with no matching User
- **THEN** the token is left as plain text and not added to `mentions`

### Requirement: story.new Real-Time Event
The system SHALL emit a `story.new` socket event to user-rooms of every viewer permitted by the story's audience scope. For the `connections` scope, recipients are the author's connections derived from shared DIRECT conversations.

#### Scenario: Public story emits to all online users in scope
- **WHEN** a public story is created
- **THEN** `story.new` is emitted with payload `{ storyId, authorId, mediaType, createdAt }` to user-rooms of all eligible viewers across all backend instances via Redis adapter

#### Scenario: Connections-only story emits only to author's connections
- **WHEN** a connections-only story is created and the author shares DIRECT conversations with users U1, U2, U3
- **THEN** `story.new` is emitted to `user:U1`, `user:U2`, `user:U3` rooms; it is NOT emitted to viewers who do not share a DIRECT conversation with the author; it is NOT emitted to the author's own room

#### Scenario: Connections-only story with no connections emits to nobody
- **WHEN** a connections-only story is created and the author shares DIRECT conversations with nobody
- **THEN** `story.new` is not emitted to any room; story still persists for the author

#### Scenario: Custom-scope story emits only to list members
- **WHEN** a custom-scope story is created
- **THEN** `story.new` is emitted only to user-rooms of users in the referenced AudienceList's `memberIds`

#### Scenario: Payload contains no media URL
- **WHEN** the event is emitted
- **THEN** the payload contains only `{ storyId, authorId, mediaType, createdAt }`; the client fetches the story via REST when the user taps it

