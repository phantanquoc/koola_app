# Spec Delta

## ADDED Requirements

### Requirement: Admin post moderation surface

The system SHALL expose admin-only endpoints for post moderation: `GET /admin/posts` (paginated, filterable by `authorId` and lifecycle), `GET /admin/posts/:id`, `POST /admin/posts/:id/takedown`, and `POST /admin/posts/:id/restore`. Posts are **not** pre-moderated: they reach the feed the moment a user creates them. These endpoints exist so a moderator can find and hide a post after a report, and undo a mistaken hide.

#### Scenario: List posts with lifecycle filter

- **WHEN** an admin calls `GET /admin/posts?active=false`
- **THEN** only posts with `isActive: false` SHALL be returned, newest first, and the response SHALL carry `{ data, total, page, limit }`
- **WHEN** `active` is absent or empty
- **THEN** both visible and removed posts SHALL be returned

#### Scenario: Lifecycle filter is a string, not a boolean

- **WHEN** the request carries `active=false` as a query parameter
- **THEN** the server SHALL interpret it as the string `'false'` and filter for removed posts; the DTO SHALL reject any value other than `true`/`false` with 400 rather than silently coercing it

#### Scenario: List enrichment is batched

- **WHEN** any page of posts is returned
- **THEN** author display names and post media URLs SHALL be resolved in a bounded number of queries for the whole page (one user lookup, one pending-report aggregate, one presign batch), so rendering a page never issues a query per row

#### Scenario: Post media is signed per page

- **WHEN** a post carries an array of media items
- **THEN** every item's `mediaKey` and `thumbnailKey` SHALL be submitted to the presign batch, and each item SHALL return `mediaUrlSigned` / `thumbnailUrlSigned` beside the original key; a key whose signing fails SHALL be `null` without failing the rest of the page

#### Scenario: Detail shows removed posts

- **WHEN** an admin calls `GET /admin/posts/:id` for a post with `isActive: false`
- **THEN** the full document SHALL be returned, so a moderator can read it before deciding to restore

#### Scenario: Detail reports pending report count

- **WHEN** an admin opens a post's detail
- **THEN** the response SHALL include `pendingReportCount` counting only reports with `status: 'pending'` and `targetType: 'post'` for that id

#### Scenario: Unknown or malformed id

- **WHEN** the id is not a valid ObjectId, or no post matches
- **THEN** the system SHALL return 404 rather than letting the ORM raise a cast error

### Requirement: Post takedown and restore are idempotent and audited

The system SHALL hide a post by setting `isActive: false` and restore it by setting `isActive: true`. Each state change SHALL be audited exactly once, and a repeat call in either direction SHALL be a no-op.

#### Scenario: Takedown hides the post everywhere

- **WHEN** an admin calls `POST /admin/posts/:id/takedown` on a visible post
- **THEN** `isActive` SHALL become `false`, an audit entry `takedown_post` with target type `post` SHALL be written, and the response SHALL report `changed: true`
- **AND** the feed and single-post reads SHALL stop returning it, because both filter on `isActive`

#### Scenario: Repeated takedown writes no second audit

- **WHEN** the same call is repeated on an already-hidden post
- **THEN** the system SHALL return `changed: false`, SHALL leave the document unchanged, SHALL write no audit entry, and SHALL emit no socket event

#### Scenario: Restore makes the post visible again

- **WHEN** an admin calls `POST /admin/posts/:id/restore` on a hidden post
- **THEN** `isActive` SHALL become `true`, an audit entry `restore_post` SHALL be written, and the response SHALL report `changed: true`

#### Scenario: Restore on a visible post is a no-op

- **WHEN** the restore is called on a post that is already visible
- **THEN** the system SHALL return `changed: false` and write no audit entry

#### Scenario: Restore does not fabricate a socket payload

- **WHEN** a post is restored
- **THEN** the system SHALL NOT emit `post.new`, because that event carries a fully resolved post view this path does not build; clients see the post on their next feed load

### Requirement: Story restore

The system SHALL expose `POST /admin/stories/:id/restore` so a moderator can undo a story takedown, and story takedown SHALL become idempotent.

#### Scenario: Restore sets the story back to visible

- **WHEN** an admin calls `POST /admin/stories/:id/restore` on a removed story
- **THEN** `isActive` SHALL become `true` and an audit entry `restore_story` SHALL be written

#### Scenario: Repeat restore is a no-op

- **WHEN** the restore is called on a story that is already visible
- **THEN** the response SHALL report `changed: false` and no audit entry SHALL be written

#### Scenario: Repeated takedown is a no-op

- **WHEN** `POST /admin/stories/:id/takedown` is called on an already-removed story
- **THEN** the response SHALL report `changed: false` and no second audit entry SHALL be written

### Requirement: Story takedown reaches connected clients

Story takedown SHALL emit the socket event name that mobile clients actually subscribe to, scoped to the story's author room rather than a global emit.

#### Scenario: Event name matches the client router

- **WHEN** an admin removes a story
- **THEN** the system SHALL emit `story.deleted` carrying `{ storyId, authorId }` to `user:<authorId>`, which is the event the client router dispatches to the moments store

### Requirement: Post search, sort, scope filter, and stats

The list endpoint SHALL support server-side search, an allow-listed sort, a visibility-scope filter, and a stats endpoint that supplies the tab counts.

#### Scenario: Search covers caption and author name

- **WHEN** an admin calls `GET /admin/posts?q=Lan`
- **THEN** the server SHALL match the substring case-insensitively against the post caption **and** against the author's display name, resolving matching users to ids before the post query, because the two fields live in different collections
- **WHEN** `q` contains regex metacharacters
- **THEN** they SHALL be escaped so they are matched literally

#### Scenario: Sort is allow-listed

- **WHEN** an admin calls `GET /admin/posts?sort=likeCount:asc`
- **THEN** results SHALL be ordered by that field in that direction
- **WHEN** the field is outside `createdAt|likeCount|commentCount`, or the direction is not `asc|desc`
- **THEN** the server SHALL return 400 naming the accepted values, rather than silently defaulting

#### Scenario: Visibility scope is filterable

- **WHEN** an admin calls `GET /admin/posts?scope=custom`
- **THEN** only posts whose `audienceScope` is `custom` SHALL be returned, and an unknown scope SHALL be rejected with 400

#### Scenario: Tab counts come from the server

- **WHEN** an admin opens the list
- **THEN** `GET /admin/posts/stats` SHALL return `{ all, active, inactive, reported, byScope }` counted over the whole collection irrespective of the tab in view, so all equals active plus inactive
- **AND** `reported` SHALL count distinct posts with at least one pending report of type `post`

#### Scenario: Stats route is not captured as an id

- **WHEN** the client requests `GET /admin/posts/stats`
- **THEN** it SHALL reach the stats handler; the route SHALL be declared before `:id`

### Requirement: Post enrichment never exposes raw ids

Post rows SHALL resolve human-readable context in a bounded number of batch queries per page, never one query per row and never by rendering an id.

#### Scenario: Mentions resolve to names

- **WHEN** a post carries mentions
- **THEN** each row SHALL include `mentionUserNames` resolved in one batched user lookup, and no raw user id SHALL be rendered in the page body

#### Scenario: Custom visibility names its list

- **WHEN** a post's scope is `custom`
- **THEN** the response SHALL include `audienceListName` from the referenced audience list, or `null` when the list no longer exists

### Requirement: Comment moderation

The system SHALL expose `GET /admin/posts/:id/comments`, `POST /admin/posts/comments/:commentId/takedown`, and `POST /admin/posts/comments/:commentId/restore`, all admin-only and audited.

#### Scenario: Comment list includes removed comments

- **WHEN** an admin lists a post's comments
- **THEN** both active and removed comments SHALL be returned with their `isActive` flag, and replies SHALL be nested under their top-level comment, so a moderator can see what was removed and restore it

#### Scenario: Takedown cascades to replies

- **WHEN** an admin removes a top-level comment
- **THEN** its active replies SHALL be removed in the same operation, because a reply under a missing parent renders orphaned
- **AND** the post's `commentCount` and `topLevelCommentCount` SHALL be recomputed from the database and written back, so the count shown on the post card stays correct

#### Scenario: Restore is single and idempotent

- **WHEN** an admin restores a removed comment
- **THEN** only that comment SHALL become visible; replies removed by an earlier cascade SHALL stay hidden until restored individually
- **AND** a restore on an already-visible comment SHALL report `changed: false` with no audit entry

#### Scenario: Repeated comment takedown is a no-op

- **WHEN** takedown is called on an already-removed comment
- **THEN** the response SHALL report `changed: false` and write no audit entry

### Requirement: Post moderation is admin-only

Every route in this capability SHALL sit behind the admin guards, so a non-admin caller can neither read posts nor change their lifecycle.

#### Scenario: Non-admin blocked
- **WHEN** a non-admin calls any route in this capability
- **THEN** the system SHALL return 403
