## ADDED Requirements

### Requirement: Direct Conversation Creation
The system SHALL automatically create a 1-on-1 conversation when the first message is sent between two users who do not already have an active conversation.

#### Scenario: First message between two users
- **WHEN** user A sends a message to user B and no active conversation exists between them
- **THEN** system creates a conversation with `type: "direct"`, `members: [A, B]`, then stores the message under that conversation

#### Scenario: Subsequent messages between two users
- **WHEN** user A sends a message to user B and an active direct conversation already exists
- **THEN** system appends the message to the existing conversation

#### Scenario: Self-message prevention
- **WHEN** user attempts to send a message to themselves
- **THEN** system returns HTTP 400 Bad Request with message "Cannot message yourself"

### Requirement: Group Conversation Creation
The system SHALL allow authenticated users to create group conversations with up to 100 members.

#### Scenario: Successful group creation
- **WHEN** authenticated user calls POST /conversations with `type: "group"`, `name: "Team Chat"`, `memberIds: [userId1, userId2, ...]` (2-99 additional members)
- **THEN** system creates conversation with `type: "group"`, adds creator + all members, returns conversation object with `members` array populated

#### Scenario: Group creation with fewer than 2 members
- **WHEN** user creates a group with 0 or 1 additional member
- **THEN** system returns HTTP 400 Bad Request with message "Group must have at least 2 other members"

#### Scenario: Group creation exceeding 100 members
- **WHEN** user creates a group with more than 100 total members
- **THEN** system returns HTTP 400 Bad Request with message "Group cannot exceed 100 members"

#### Scenario: Group name required
- **WHEN** user creates a group without a name
- **THEN** system returns HTTP 400 Bad Request with validation error "Group name is required"

### Requirement: Add Member to Group
The system SHALL allow group admins to add members to a group conversation.

#### Scenario: Admin adds member
- **WHEN** conversation admin calls POST /conversations/:conversationId/members with `userId`
- **THEN** system adds user to conversation members, returns updated member list

#### Scenario: Non-admin adds member
- **WHEN** non-admin member attempts to add a user
- **THEN** system returns HTTP 403 Forbidden

#### Scenario: Add member to 1-on-1 conversation
- **WHEN** user attempts to add a member to a direct conversation
- **THEN** system returns HTTP 400 Bad Request with message "Cannot add members to a direct conversation"

### Requirement: Remove Member from Group
The system SHALL allow group admins to remove members from a group conversation.

#### Scenario: Admin removes member
- **WHEN** conversation admin calls DELETE /conversations/:conversationId/members/:userId
- **THEN** system removes user from conversation members; if user was the last admin, conversation is deleted

#### Scenario: Non-admin removes member
- **WHEN** non-admin member attempts to remove a user
- **THEN** system returns HTTP 403 Forbidden

#### Scenario: Self-remove from group
- **WHEN** user calls DELETE /conversations/:conversationId/members/me (leave group)
- **THEN** system removes user from members; if user is the only admin, assigns next oldest member as admin

### Requirement: Conversation List
The system SHALL return a paginated list of all conversations for the authenticated user, sorted by last message timestamp (descending).

#### Scenario: Get conversation list
- **WHEN** authenticated user calls GET /conversations?page=1&limit=20
- **THEN** system returns `{ conversations: [...], hasMore: boolean, total: number }` where each conversation includes `id`, `type`, `name` (group only), `members` (summary: id, displayName, avatar), `lastMessage`, `lastMessageAt`, `unreadCount`

#### Scenario: Pagination of conversation list
- **WHEN** user requests page 2 with limit 20
- **THEN** system returns conversations 21-40, ordered by lastMessageAt descending

### Requirement: Conversation Details
The system SHALL return full conversation details for authenticated participants.

#### Scenario: Get direct conversation details
- **WHEN** authenticated participant calls GET /conversations/:conversationId
- **THEN** system returns full conversation including all members (full detail), last 20 messages, unreadCount

#### Scenario: Non-participant access
- **WHEN** user who is not a member calls GET /conversations/:conversationId
- **THEN** system returns HTTP 404 Not Found (not 403, to prevent enumeration)

### Requirement: System Messages for Member Changes
The system SHALL insert a system message in the conversation when a member is added or removed.

#### Scenario: System message on add
- **WHEN** user A is added to group by admin B
- **THEN** system creates a message with `type: "system"`, `content: "A was added to the group"` visible only within that conversation

#### Scenario: System message on remove
- **WHEN** user A is removed from group by admin B
- **THEN** system creates a message with `type: "system"`, `content: "A was removed from the group"`

#### Scenario: System message on leave
- **WHEN** user A leaves the group voluntarily
- **THEN** system creates a message with `type: "system"`, `content: "A left the group"`
