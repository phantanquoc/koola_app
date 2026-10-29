## MODIFIED Requirements

### Requirement: Post Likes
The system SHALL store post likes in a dedicated `post_likes` collection with one document per `(postId, userId)` pair; like state is per-user and idempotent. The legacy embedded `likes[]` array on the Post document is migrated once and then removed.

#### Scenario: Like and unlike a post
- **WHEN** user calls `POST /moments/posts/:id/like` twice (like then unlike, or per API toggle semantics)
- **THEN** first call creates a `post_likes` row, sets `likedByMe = true` and increments `likeCount`; second call removes the row and reverts both; a `post.reaction` socket event is emitted to permitted viewers

#### Scenario: Like invisible post is forbidden
- **WHEN** user likes a post outside their audience scope
- **THEN** system rejects with 403/404 without changing counts

#### Scenario: Legacy embedded likes are migrated without loss
- **WHEN** the one-time migration runs
- **THEN** every entry in each post's legacy `likes[]` array becomes a `post_likes` row, `likeCount` equals the row count per post afterwards, and re-running the migration creates no duplicates

### Requirement: Post Comments and Replies
The system SHALL support paginated top-level comments and single-level replies on posts, with comment creation emitting `post.comment` socket events carrying the comment view and the updated post. Deleting a top-level comment soft-deletes its replies in the same write. Replies are paginated through a dedicated endpoint with an `_id` cursor.

#### Scenario: Comment on a post
- **WHEN** user calls `POST /moments/posts/:id/comments` with `{ content: "nice!" }`
- **THEN** system creates the comment, increments `commentCount`, returns it, and emits `post.comment` with `{ postId, comment, commentCount }` to permitted viewers

#### Scenario: Reply to a comment
- **WHEN** user calls `POST /moments/posts/:id/comments` with `{ content: "thanks", parentId: "<commentId>" }`
- **THEN** system creates a nested reply linked to the parent; replying to a non-existent parent rejects with 404

#### Scenario: List comments with pagination
- **WHEN** user calls `GET /moments/posts/:id/comments?limit=20`
- **THEN** system returns top-level comments newest-last (chronological) with `_id`-cursor pagination, each carrying its replies (up to 3 preview + `replyCount`), plus `deletedIds` and `activeCommentCount`

#### Scenario: List replies with cursor pagination
- **WHEN** user calls `GET /moments/posts/:id/comments/:commentId/replies?cursor=<lastId>&limit=20`
- **THEN** system returns that comment's replies in chronological order with `nextCursor`; an unknown comment id returns 404

#### Scenario: Delete own comment cascades to replies
- **WHEN** comment author (or post author) calls `DELETE /moments/posts/comments/:commentId` on a top-level comment with 2 active replies
- **THEN** system soft-deletes the comment and both replies in the same write, decrements `commentCount` by the number of active rows affected, and emits `post.comment` with the updated count

#### Scenario: Reject overlong comment
- **WHEN** user posts a comment exceeding 1000 characters
- **THEN** system rejects with 400

## ADDED Requirements

### Requirement: Comment Likes
The system SHALL allow toggling a like on a top-level comment or reply; like state is per-user and idempotent, stored in a `comment_likes` collection.

#### Scenario: Like and unlike a comment
- **WHEN** user calls `POST /moments/posts/comments/:commentId/like` twice
- **THEN** first call sets `likedByMe = true` and increments the comment's `likeCount`; second call reverts both

#### Scenario: Like on invisible post's comment is forbidden
- **WHEN** user likes a comment on a post outside their audience scope
- **THEN** system rejects with 403/404 without changing counts

### Requirement: Post Share Dedup
The system SHALL dedupe share-count increments per user per post within a rolling 24-hour window using Redis; repeat shares return the existing link payload without incrementing.

#### Scenario: First share increments and returns links
- **WHEN** user calls `POST /moments/posts/:id/share`
- **THEN** system increments `shareCount` once and returns `{ shareCount, deepLink: "koola://moments/post/:id", appLink: "koola://moments/post/:id" }`

#### Scenario: Repeat share within 24h does not increment
- **WHEN** the same user calls `POST /moments/posts/:id/share` again within 24 hours
- **THEN** system returns the current `{ shareCount, deepLink, appLink }` without incrementing `shareCount`

### Requirement: Image Dimensions Persisted
The system SHALL persist validated `width` and `height` on each post media entry so clients can reserve layout before bytes arrive.

#### Scenario: Create post with dimensions
- **WHEN** user calls `POST /moments/posts` with a media entry carrying `{ width: 1080, height: 1350 }`
- **THEN** the stored media entry keeps both values and the feed view model exposes them

#### Scenario: Absurd dimensions are rejected
- **WHEN** user sends `{ width: 0 }` or a dimension above the documented sanity bound
- **THEN** system rejects with 400

### Requirement: Post Edit Delete Report
The system SHALL let authors edit caption/audience, delete (soft) their posts, and let any viewer report a post. Repeat reports by the same user on the same post are deduped, and posts the viewer reported are hidden from that viewer's feed.

#### Scenario: Edit own post caption
- **WHEN** author calls `PATCH /moments/posts/:id` with a new caption
- **THEN** system updates caption (media immutable in v1), returns the updated view model; non-authors get 403

#### Scenario: Delete own post
- **WHEN** author calls `DELETE /moments/posts/:id`
- **THEN** system sets `isActive = false`, emits `post.deleted` to permitted viewers, and the post disappears from feeds; non-authors get 403

#### Scenario: Report a post
- **WHEN** viewer calls `POST /moments/posts/:id/report` with `{ reason }`
- **THEN** system records the report for moderation (visible to `admin-moments-moderation`) and returns success without altering the post

#### Scenario: Duplicate report is deduped
- **WHEN** the same viewer reports the same post twice
- **THEN** the second call returns success without creating a new report row

#### Scenario: Reported post is hidden from the reporter
- **WHEN** a viewer who reported a post fetches the feed
- **THEN** that post is absent from their feed while remaining visible to everyone else
