## ADDED Requirements

### Requirement: Post Creation
The system SHALL allow authenticated users to create a post with optional text (≤ 5000 characters), 0–10 media attachments (image or video via presigned MinIO keys), @mentions, and an audience scope. Each video attachment is capped at 60 seconds client-side. Creation is idempotent via `clientPostId`.

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

### Requirement: Post Feed
The system SHALL serve a cursor-paginated reverse-chronological feed of posts visible to the viewer, each item resolved with presigned media URLs, reaction counts, `likedByMe`, and a 2-comment preview.

#### Scenario: Fetch first feed page
- **WHEN** authenticated user calls `GET /moments/posts/feed` with no cursor
- **THEN** system returns up to 20 posts the viewer may see (public + connections-visible + custom-list-visible), newest first, with `nextCursor` for the next page

#### Scenario: Feed excludes other users' private or out-of-scope posts
- **WHEN** viewer fetches the feed
- **THEN** posts with `isActive = false`, deleted posts, and posts whose audience scope excludes the viewer are absent

#### Scenario: Feed item view model is complete
- **WHEN** feed returns a post
- **THEN** each item includes presigned media URLs, `reactionCount`, `commentCount`, `shareCount`, `likedByMe` for the viewer, author display name + avatar, and up to 2 latest top-level comments

### Requirement: Post Likes
The system SHALL allow toggling a like on a post; like state is per-user and idempotent.

#### Scenario: Like and unlike a post
- **WHEN** user calls `POST /moments/posts/:id/like` twice (like then unlike, or per API toggle semantics)
- **THEN** first call sets `likedByMe = true` and increments `likeCount`; second call reverts both; a `post.reaction` socket event is emitted to permitted viewers

#### Scenario: Like invisible post is forbidden
- **WHEN** user likes a post outside their audience scope
- **THEN** system rejects with 403/404 without changing counts

### Requirement: Post Comments and Replies
The system SHALL support paginated top-level comments and single-level replies on posts, with comment creation emitting `post.comment` socket events.

#### Scenario: Comment on a post
- **WHEN** user calls `POST /moments/posts/:id/comments` with `{ content: "nice!" }`
- **THEN** system creates the comment, increments `commentCount`, returns it, and emits `post.comment` to permitted viewers

#### Scenario: Reply to a comment
- **WHEN** user calls `POST /moments/posts/:id/comments` with `{ content: "thanks", parentId: "<commentId>" }`
- **THEN** system creates a nested reply linked to the parent; replying to a non-existent parent rejects with 404

#### Scenario: List comments with pagination
- **WHEN** user calls `GET /moments/posts/:id/comments?limit=20`
- **THEN** system returns top-level comments newest-last (chronological) with cursor pagination, each carrying its replies (up to 3 preview + `replyCount`)

#### Scenario: Delete own comment
- **WHEN** comment author (or post author) calls `DELETE /moments/posts/comments/:commentId`
- **THEN** system soft-deletes the comment, decrements `commentCount` (and reply linkage preserved as "[deleted]"), emitting `post.comment` update

#### Scenario: Reject overlong comment
- **WHEN** user posts a comment exceeding 1000 characters
- **THEN** system rejects with 400

### Requirement: Post Share
The system SHALL record shares and provide a deep link; v1 share is count + external link (no repost-to-feed).

#### Scenario: Share a post
- **WHEN** user calls `POST /moments/posts/:id/share`
- **THEN** system increments `shareCount` once per call and returns `{ shareCount, deepLink: "koola://moments/post/:id" }`

### Requirement: Post Edit Delete Report
The system SHALL let authors edit caption/audience, delete (soft) their posts, and let any viewer report a post.

#### Scenario: Edit own post caption
- **WHEN** author calls `PATCH /moments/posts/:id` with a new caption
- **THEN** system updates caption (media immutable in v1), returns the updated view model; non-authors get 403

#### Scenario: Delete own post
- **WHEN** author calls `DELETE /moments/posts/:id`
- **THEN** system sets `isActive = false`, emits `post.deleted` to permitted viewers, and the post disappears from feeds; non-authors get 403

#### Scenario: Report a post
- **WHEN** viewer calls `POST /moments/posts/:id/report` with `{ reason }`
- **THEN** system records the report for moderation (visible to `admin-moments-moderation`) and returns success without altering the post

### Requirement: Post Realtime Fanout
The system SHALL push post lifecycle events over the existing Socket.IO user-room fanout so feeds update without polling.

#### Scenario: New post reaches viewers live
- **WHEN** a post is created with public scope
- **THEN** every permitted viewer receives `post.new` with `{ postId, authorId, createdAt }` (IDs only, never full media payloads)

#### Scenario: Deleted post disappears live
- **WHEN** a post is deleted
- **THEN** permitted viewers receive `post.deleted` with `{ postId }` and clients remove it from the feed without refetch

#### Scenario: Like and comment events update counts live
- **WHEN** a like or comment occurs
- **THEN** permitted viewers receive `post.reaction` / `post.comment` with `{ postId, likeCount }` / `{ postId, commentId, commentCount }` and clients patch counts in place

### Requirement: Mobile Post Feed Replaces Mock
The mobile app SHALL render the Moments feed from the real posts API with loading, error, empty, and success states, realtime prepend, and pull-to-refresh with cursor pagination; no mock post or mock story data remains.

#### Scenario: Feed loads real posts
- **WHEN** a signed-in user opens the Moments screen online
- **THEN** the app calls the real feed API and renders returned posts in `PostCard` rows; skeleton rings show during cold load; errors show an inline retryable banner (never a full-screen replacement); an empty feed shows a real empty state with a composer entry point

#### Scenario: New post appears live without refetch
- **WHEN** a `post.new` socket event arrives for a post not in the list
- **THEN** the app fetches that single post by ID and prepends it to the feed

#### Scenario: All post actions call the API
- **WHEN** the user taps like, comment, share, author, menu, or media on a `PostCard`
- **THEN** the app performs the real flow (API call, comment sheet, share sheet, profile nav, edit/delete/report menu, fullscreen viewer) — no "chưa có backend" toast remains for post actions

#### Scenario: No mock modules remain
- **WHEN** the change is complete
- **THEN** `momentsMockPosts.ts` and `momentsMockStories.ts` are deleted, `refreshFeed` has no mock fallback (errors set `error` state), and no test asserts mock-feed rendering

### Requirement: Mobile Post Composer
The mobile app SHALL provide a post composer supporting 0–10 image/video attachments, caption, audience picker, mentions, and idempotent publish with upload progress and inline error + retry.

#### Scenario: Publish multi-photo post
- **WHEN** the user picks 3 photos, writes a caption, chooses public scope, and taps publish
- **THEN** the app uploads each asset via presigned URL with progress, calls `POST /moments/posts` once with a `clientPostId`, navigates back on success, and the new post appears at the feed top (via `post.new` or optimistic prepend reconciled by ID)

#### Scenario: Video over 60 seconds is rejected before upload
- **WHEN** the user picks a video longer than 60 seconds
- **THEN** the composer shows inline error "Video dài quá 60 giây" and does not start any upload

#### Scenario: Publish failure is retryable
- **WHEN** upload or post creation fails (offline, 5xx)
- **THEN** the composer stays open, shows an inline error with a retry button, preserves picked assets + caption (no data loss), and offline durable posts are queued with the same `clientPostId` for replay dedup
