# Spec Delta

## MODIFIED Requirements

### Requirement: Post Creation

The system SHALL allow authenticated users to create a post with optional text (≤ 5000 characters), 0–10 media attachments (image or video via presigned MinIO keys), @mentions, an optional music reference bounded to a 28-second segment, and an audience scope. Each video attachment is capped at 60 seconds client-side. Creation is idempotent via `clientPostId`.

#### Scenario: Create text-only post with public scope

- **WHEN** authenticated user calls `POST /moments/posts` with `{ caption: "hello", media: [], audienceScope: "public" }`
- **THEN** system creates a Post document with `likeCount = 0`, `commentCount = 0`, `shareCount = 0`, `isActive = true`, returns the created post view model, emits `post.new` to the user-room of every permitted viewer, and triggers FCM push for mentioned users passing the privacy filter

#### Scenario: Create multi-media post

- **WHEN** user calls `POST /moments/posts` with 3 image mediaKeys + 1 video mediaKey (duration 12) and `audienceScope: "connections"`
- **THEN** system creates the post with all 4 attachments in order, emits `post.new` only to connections of the author

#### Scenario: Reject post with no content

- **WHEN** user calls `POST /moments/posts` with empty caption and empty media array
- **THEN** system rejects with 400 (post must contain text or at least one attachment)

#### Scenario: Reject too many attachments

- **WHEN** user calls `POST /moments/posts` with 11 media items
- **THEN** system rejects with 400 (max 10 attachments)

#### Scenario: Idempotent replay with clientPostId

- **WHEN** user calls `POST /moments/posts` twice with the same `clientPostId`
- **THEN** system returns the existing post on the second call instead of creating a duplicate

#### Scenario: Create post with custom audience list

- **WHEN** user calls `POST /moments/posts` with `audienceScope: "custom"` and an `audienceListId` owned by the author
- **THEN** system creates the post scoped to that list; when the list does not exist or is not owned by the author, the system rejects with 403

#### Scenario: Create post with a music segment

- **WHEN** user creates a post with `{ musicRef: { trackId: "<id>", startMs: 0, lengthMs: 28000 }, audienceScope: "public" }`
- **THEN** system validates the track is active, validates the segment fits the track, persists the reference on the post, and returns HTTP 201

#### Scenario: Segment longer than 28 seconds is rejected

- **WHEN** a post creation sends `lengthMs` greater than 28000
- **THEN** the system SHALL return 400 naming the 28-second limit, and SHALL NOT create the post

#### Scenario: Segment past the end of the track is rejected

- **WHEN** `startMs + lengthMs` exceeds the track's `durationMs` beyond a 500 ms rounding tolerance
- **THEN** the system SHALL return 400 and SHALL NOT create the post

#### Scenario: Inactive track rejected on a post

- **WHEN** the referenced track is missing or inactive
- **THEN** the system SHALL return 400 with the same message the story path uses, so clients show one error string

#### Scenario: Post without music

- **WHEN** a post is created with no `musicRef`
- **THEN** the post SHALL be created normally and reads SHALL report `musicRef: null`

#### Scenario: Usage counter increments for post music

- **WHEN** a post is created with a `musicRef`
- **THEN** the referenced track's `usageCount` SHALL increment by one on the same best-effort basis as the story path — a counter failure SHALL NOT fail post creation

#### Scenario: Post reads carry the reference

- **WHEN** a post with a music reference is read from the feed or detail endpoint
- **THEN** the response SHALL include `musicRef` with `trackId`, `startMs`, `lengthMs`, and the track's title and artist for attribution
