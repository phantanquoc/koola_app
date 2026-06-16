# moments-audience-lists Specification

## Purpose
TBD - created by archiving change moments-feature. Update Purpose after archive.
## Requirements
### Requirement: Create Audience List
The system SHALL allow authenticated users to create named, reusable audience lists for the `custom` story scope.

#### Scenario: Create empty audience list
- **WHEN** user calls `POST /moments/audience-lists` with `{ name: "Bạn thân", emoji: "💚" }`
- **THEN** system creates an AudienceList document `{ ownerId, name, emoji, memberIds: [], createdAt, updatedAt }`, returns HTTP 201 with the created list

#### Scenario: Create list with initial members
- **WHEN** user calls `POST /moments/audience-lists` with `{ name: "Đồng nghiệp", memberIds: ["<id1>", "<id2>"] }` and all member IDs reference existing users
- **THEN** system creates the list with the provided members

#### Scenario: Name validation
- **WHEN** name is empty, > 50 characters, or duplicates another list owned by the same user
- **THEN** system returns HTTP 400 with the appropriate validation error

#### Scenario: Member must exist
- **WHEN** any provided `memberId` does not reference an existing user
- **THEN** system returns HTTP 400 with `"Invalid member: <id>"`

### Requirement: Audience List Schema
The system SHALL persist audience lists with indexes that support per-owner queries and per-member membership lookups.

#### Scenario: Schema and indexes
- **WHEN** the MomentsModule initializes
- **THEN** the AudienceLists collection exists with fields `{ _id, ownerId, name, emoji, memberIds, createdAt, updatedAt }` and indexes `{ ownerId: 1, createdAt: -1 }`, `{ memberIds: 1 }` (multi-key for "lists containing user X"), `{ ownerId: 1, name: 1 }` `unique: true` (prevents duplicate names per owner)

### Requirement: Edit Audience List
The system SHALL allow the owner to add/remove members and rename a list.

#### Scenario: Add members
- **WHEN** owner calls `PATCH /moments/audience-lists/:listId` with `{ addMemberIds: ["<id3>"] }`
- **THEN** system appends the IDs to `memberIds` (de-duplicated), updates `updatedAt`, invalidates the Redis cache `audience:listsContaining:<id3>`

#### Scenario: Remove members
- **WHEN** owner calls `PATCH /moments/audience-lists/:listId` with `{ removeMemberIds: ["<id1>"] }`
- **THEN** system removes the IDs from `memberIds`, updates `updatedAt`, invalidates the Redis cache for each removed user

#### Scenario: Rename list
- **WHEN** owner calls `PATCH /moments/audience-lists/:listId` with `{ name: "Bạn thân nhất" }`
- **THEN** system updates the name, validating uniqueness across owner's lists; if duplicate, returns HTTP 400

#### Scenario: Non-owner attempts edit
- **WHEN** caller is not the owner
- **THEN** system returns HTTP 403

### Requirement: Delete Audience List
The system SHALL allow the owner to delete a list; any active stories referencing the list remain published but become unviewable since the audience is empty.

#### Scenario: Owner deletes list
- **WHEN** owner calls `DELETE /moments/audience-lists/:listId`
- **THEN** system deletes the list, invalidates Redis caches for all former members; existing stories with `audienceListId = <listId>` are no longer fetchable by anyone (the join target is gone) and the author is shown a system warning on the next composer open

#### Scenario: Owner deletes list with active referencing stories
- **WHEN** the list is referenced by an active story
- **THEN** the system DELETES the list (the author has chosen this); operations runbook documents this as expected behavior

### Requirement: List Audience Lists
The system SHALL allow the owner to fetch their own lists for use in the composer audience picker.

#### Scenario: Fetch own lists
- **WHEN** owner calls `GET /moments/audience-lists`
- **THEN** system returns the lists ordered by `createdAt DESC` with `{ listId, name, emoji, memberCount }`

#### Scenario: Fetch list members
- **WHEN** owner calls `GET /moments/audience-lists/:listId`
- **THEN** system returns full member details `{ userId, displayName, avatarUrl }`; non-owners receive HTTP 403

### Requirement: Redis Cache for Viewer List Membership
The system SHALL cache the set of audience list IDs containing each viewer in Redis to avoid per-feed-load AudienceLists collection scans.

#### Scenario: Cache populated on first feed load
- **WHEN** viewer requests the moments feed and there is no cache key `audience:listsContaining:<viewerId>`
- **THEN** system queries `AudienceLists.find({ memberIds: viewerId }, { _id: 1 })`, stores the array of list IDs as a JSON string in Redis with TTL 5 minutes, then proceeds with the feed query

#### Scenario: Cache hit
- **WHEN** the cache key exists
- **THEN** system reads the IDs from Redis (no Mongo query) and uses them in the feed `$or` clause

#### Scenario: Cache invalidated on list edit
- **WHEN** an AudienceList's `memberIds` is added or removed
- **THEN** system deletes the cache key `audience:listsContaining:<userId>` for each affected user

#### Scenario: Cache survives feed query failure
- **WHEN** the feed query fails after the cache read
- **THEN** the cache is left intact; only writes that change membership invalidate it

