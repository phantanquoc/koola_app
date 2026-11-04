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

### Requirement: Post moderation is admin-only

Every route in this capability SHALL sit behind the admin guards, so a non-admin caller can neither read posts nor change their lifecycle.

#### Scenario: Non-admin blocked

- **WHEN** a non-admin calls any route in this capability
- **THEN** the system SHALL return 403
