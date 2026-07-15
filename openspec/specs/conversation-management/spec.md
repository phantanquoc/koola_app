# conversation-management Specification

## Purpose
TBD - created by archiving change backend-conversations. Update Purpose after archive.
## Requirements
### Requirement: Direct Conversation Auto-Creation
The system SHALL automatically create a 1-on-1 conversation when the first message is sent between two users who do not already have an active direct conversation.

#### Scenario: First message between two users
- **WHEN** the MessagesModule sends a message to a conversation that does not yet exist
- **THEN** the system creates a conversation with `type: "direct"`, `members: [{ userId: A, role: "member" }, { userId: B, role: "member" }]`

#### Scenario: Subsequent messages between two users
- **WHEN** a message is sent between two users who already have an active direct conversation
- **THEN** the message is appended to the existing conversation

#### Scenario: Self-message prevention
- **WHEN** a direct conversation is attempted with the same sender and recipient
- **THEN** the system returns HTTP 400 Bad Request with message "Cannot message yourself"

### Requirement: Group Conversation Creation
The system SHALL allow authenticated users to create group conversations with 3-100 total members (creator + 2-99 others).

#### Scenario: Successful group creation
- **WHEN** authenticated user calls POST /conversations with `type: "group"`, `name: "Team Chat"`, `memberIds: [userId1, userId2, ...]`
- **THEN** system creates conversation with `type: "group"`, creator added as first admin, all `memberIds` added as members, returns conversation object

#### Scenario: Group creation with fewer than 2 other members
- **WHEN** user creates a group with 0 or 1 additional member
- **THEN** system returns HTTP 400 Bad Request with message "Group must have at least 2 other members"

#### Scenario: Group creation exceeding 100 members
- **WHEN** user creates a group with more than 100 total members (including creator)
- **THEN** system returns HTTP 400 Bad Request with message "Group cannot exceed 100 members"

#### Scenario: Group name required
- **WHEN** user creates a group without a name
- **THEN** system returns HTTP 400 Bad Request with validation error "Group name is required"

### Requirement: Add Member to Group
The system SHALL allow group admins to add members to a group conversation.

#### Scenario: Admin adds member
- **WHEN** conversation admin calls POST /conversations/:conversationId/members with `{ userId }`
- **THEN** system adds user to conversation members with `role: "member"`, inserts system message "X was added to the group", returns updated member list

#### Scenario: Non-admin adds member
- **WHEN** non-admin member attempts to add a user
- **THEN** system returns HTTP 403 Forbidden

#### Scenario: Add member to direct conversation
- **WHEN** user attempts to add a member to a conversation with `type: "direct"`
- **THEN** system returns HTTP 400 Bad Request with message "Cannot add members to a direct conversation"

#### Scenario: Add non-existent user
- **WHEN** admin attempts to add a userId that does not exist in the users collection
- **THEN** system returns HTTP 404 Not Found with message "User not found"

### Requirement: Searchable Group Member Selection
The mobile group administration UI SHALL allow authorized admins to find and select users without manually entering database user IDs.

#### Scenario: Admin opens add-member flow
- **WHEN** a group admin activates add member
- **THEN** the UI SHALL present searchable user identity results with name and avatar
- **AND** raw user IDs SHALL not be requested as user input
- **AND** the search pattern SHALL reuse the existing `GroupCreateModal` search component/pattern where applicable

#### Scenario: Search returns existing members
- **WHEN** search results include the current user or an existing group member
- **THEN** those users SHALL be excluded or visibly non-selectable

#### Scenario: Admin confirms selected members
- **WHEN** one or more eligible users are selected and the admin confirms
- **THEN** the client SHALL submit their IDs through the existing authorized member API
- **AND** duplicate submissions SHALL be prevented while the request is pending

#### Scenario: Add-member request fails
- **WHEN** the API rejects or fails the request
- **THEN** selections SHALL remain recoverable
- **AND** a clear Vietnamese error and retry path SHALL be shown

### Requirement: Remove Member from Group
The system SHALL allow group admins to remove members from a group conversation.

#### Scenario: Admin removes member
- **WHEN** conversation admin calls DELETE /conversations/:conversationId/members/:userId
- **THEN** system removes user from conversation members, inserts system message "X was removed from the group"

#### Scenario: Non-admin removes member
- **WHEN** non-admin member attempts to remove a user
- **THEN** system returns HTTP 403 Forbidden

#### Scenario: Last admin removes last non-admin member
- **WHEN** admin removes the last non-admin member, leaving only themselves
- **THEN** conversation is preserved; admin remains as sole member with admin role

#### Scenario: Last admin leaves (self-remove)
- **WHEN** user calls DELETE /conversations/:conversationId/members/me and is the only admin
- **THEN** system reassigns admin role to the next oldest member by `joinedAt`; if no other members exist, the conversation is deleted

### Requirement: Leave Group (Self-Remove)
The system SHALL allow any member to leave a group voluntarily.

#### Scenario: Member leaves group
- **WHEN** user calls DELETE /conversations/:conversationId/members/me
- **THEN** system removes user from members, inserts system message "X left the group"

#### Scenario: Direct conversation self-remove
- **WHEN** user calls DELETE on their own membership in a direct conversation
- **THEN** the entire conversation is deleted

### Requirement: Conversation List
The system SHALL return a paginated list of all conversations for the authenticated user, sorted by `lastMessageAt` descending.

#### Scenario: Get conversation list
- **WHEN** authenticated user calls GET /conversations?page=1&limit=20
- **THEN** system returns `{ conversations: [...], hasMore: boolean, total: number }` where each conversation includes `id`, `type`, `name` (group only), `members` (summary: id, displayName, avatar), `lastMessagePreview`, `lastMessageAt`, `unreadCount`

#### Scenario: Pagination
- **WHEN** user requests page 2 with limit 20
- **THEN** system returns conversations 21-40 ordered by `lastMessageAt` descending

### Requirement: Conversation Details
The system SHALL return full conversation details for authenticated participants.

#### Scenario: Get conversation details
- **WHEN** authenticated participant calls GET /conversations/:conversationId
- **THEN** system returns full conversation including all members with full detail, last 20 messages, unreadCount for current user

#### Scenario: Non-participant access
- **WHEN** user who is not a member calls GET /conversations/:conversationId
- **THEN** system returns HTTP 404 Not Found

### Requirement: Update Group Conversation
The system SHALL allow group admins to update conversation metadata (name, avatar).

#### Scenario: Admin updates group name
- **WHEN** conversation admin calls PUT /conversations/:conversationId with `{ name: "New Name" }`
- **THEN** system updates conversation name, returns updated conversation

#### Scenario: Admin updates group avatar
- **WHEN** conversation admin calls PUT /conversations/:conversationId with `{ avatar: "url" }`
- **THEN** system updates conversation avatar, returns updated conversation

#### Scenario: Non-admin updates group
- **WHEN** non-admin member attempts to update conversation metadata
- **THEN** system returns HTTP 403 Forbidden

#### Scenario: Update direct conversation
- **WHEN** user attempts to update a direct conversation
- **THEN** system returns HTTP 400 Bad Request with message "Cannot update a direct conversation"

