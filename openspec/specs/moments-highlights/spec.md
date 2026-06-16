# moments-highlights Specification

## Purpose
TBD - created by archiving change moments-feature. Update Purpose after archive.
## Requirements
### Requirement: Promote Story to Highlight
The system SHALL allow the author to promote any of their stories (active or expired-but-not-yet-deleted) to a Highlight, preserving the story document and its media indefinitely.

#### Scenario: Author promotes active story to a new Highlight
- **WHEN** author calls `POST /moments/highlights` with `{ title: "Du lịch Đà Lạt", storyIds: ["<id1>", "<id2>"] }`
- **THEN** system creates a Highlight document `{ ownerId, title, coverMediaKey, storyIds, createdAt }`, sets `expiresAt = null` on each referenced story (TTL skips them), copies each story's media from `stories/<storyId>/<key>` to `highlights/<userId>/<storyId>/<key>` and updates `Stories.mediaKey` to the new key, returns HTTP 201 with the created Highlight

#### Scenario: Author adds story to existing Highlight
- **WHEN** author calls `PATCH /moments/highlights/:highlightId` with `{ addStoryIds: ["<id3>"] }`
- **THEN** system appends to `Highlight.storyIds`, nullifies the story's `expiresAt`, and migrates its media to the `highlights/` prefix

#### Scenario: Author re-orders stories in Highlight
- **WHEN** author calls `PATCH /moments/highlights/:highlightId` with `{ storyIds: ["<id2>", "<id1>"] }` (full reorder)
- **THEN** the Highlight's `storyIds` array is replaced in the new order

#### Scenario: Promoting a story that is not the author's
- **WHEN** caller does not own the referenced story
- **THEN** system returns HTTP 403

#### Scenario: Promoting an already-deleted story
- **WHEN** the referenced story document no longer exists in MongoDB
- **THEN** system returns HTTP 404 with `"Story no longer available"`

### Requirement: Highlight Schema and Media Migration
The system SHALL store Highlights in a separate collection that references stories without copying their content, and migrate referenced media to a non-expiring MinIO prefix.

#### Scenario: Schema and indexes
- **WHEN** the MomentsModule initializes
- **THEN** the Highlights collection exists with fields `{ _id, ownerId, title, coverMediaKey, storyIds, createdAt, updatedAt }` and indexes `{ ownerId: 1, createdAt: -1 }`

#### Scenario: Media key migration on first promotion
- **WHEN** a story is promoted for the first time
- **THEN** the media object is copied from `stories/<storyId>/<key>` to `highlights/<userId>/<storyId>/<key>` (server-side copy via MinIO API), the `Stories.mediaKey` field is updated to the new key, and the original `stories/` object is deleted

#### Scenario: Highlight media is exempt from MinIO lifecycle
- **WHEN** a media object exists under `highlights/`
- **THEN** no MinIO lifecycle policy applies and the object persists indefinitely

#### Scenario: Cover media defaults to first story's media
- **WHEN** a Highlight is created without an explicit `coverMediaKey`
- **THEN** the system uses the first story's `mediaKey` (or `thumbnailKey` for video) as the cover

### Requirement: Remove Story from Highlight
The system SHALL allow the author to remove a story from a Highlight; if the story is no longer in any Highlight and its original `expiresAt` has passed, the story is hard-deleted.

#### Scenario: Remove story from Highlight, story is also expired
- **WHEN** author calls `PATCH /moments/highlights/:highlightId` with `{ removeStoryIds: ["<id>"] }` and the story's original 24h window has already passed
- **THEN** system removes the story from the Highlight, hard-deletes the Story document, and removes the media from `highlights/`

#### Scenario: Remove story from Highlight, story still within original 24h
- **WHEN** the story's original 24h has not passed
- **THEN** system removes the story from the Highlight, restores `expiresAt = createdAt + 24h`, and migrates the media back to `stories/` prefix so the lifecycle policy can reclaim it

#### Scenario: Removing last story from a Highlight
- **WHEN** the removal leaves the Highlight with empty `storyIds`
- **THEN** system soft-deletes the Highlight (sets `isActive: false`)

### Requirement: Delete Highlight
The system SHALL allow the author to delete a Highlight; this action triggers cascade cleanup on all referenced stories.

#### Scenario: Author deletes Highlight
- **WHEN** author calls `DELETE /moments/highlights/:highlightId`
- **THEN** system deletes the Highlight; for each referenced story, applies the same logic as "Remove story from Highlight"

### Requirement: Read User's Highlights
The system SHALL allow any user (subject to story-level audience filtering at view time) to fetch the list of a user's Highlights.

#### Scenario: View own Highlights
- **WHEN** user calls `GET /moments/users/me/highlights`
- **THEN** system returns the user's Highlights ordered by `createdAt DESC` with `{ highlightId, title, coverMediaKey, storyCount, createdAt }`

#### Scenario: View another user's Highlights
- **WHEN** user calls `GET /moments/users/:userId/highlights`
- **THEN** system returns the target user's Highlights; story access is still filtered per-story by audience scope when individual stories are opened

#### Scenario: View Highlight detail
- **WHEN** user calls `GET /moments/highlights/:highlightId`
- **THEN** system returns the Highlight metadata plus an ordered array of stories the caller is permitted to view; stories the caller cannot view are silently filtered out

#### Scenario: All stories filtered out by privacy
- **WHEN** the caller cannot view any story in the Highlight
- **THEN** system returns HTTP 404 with `"Highlight has no visible content"`

### Requirement: Highlight Media Reference Integrity
The system SHALL prevent orphaning of media when stories transition between active, Highlight, and deleted states.

#### Scenario: Promotion is atomic with media migration
- **WHEN** a promotion is in progress
- **THEN** if the MinIO copy fails, the Mongo `expiresAt` nullification is rolled back; if the Mongo update fails, the new `highlights/` object is deleted

#### Scenario: Orphan detector catches stale stories/ entries
- **WHEN** an orphan detection job runs
- **THEN** it identifies any object under `stories/` whose `Stories.expiresAt` is null (indicating a failed migration) and re-attempts the migration to `highlights/`

