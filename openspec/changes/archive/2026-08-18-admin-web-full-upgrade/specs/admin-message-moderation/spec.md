## ADDED Requirements

### Requirement: Admin can search and soft-delete messages

The system SHALL expose `GET /admin/messages/search` (paginated, `q` required, optional `conversationId` filter) backed by existing MongoDB text index with escaped regex fallback, and `POST /admin/messages/:id/soft-delete` (trusted actor, no sender-ownership check) that sets soft-delete state and emits `message_deleted` to the conversation room.

#### Scenario: Message search across conversations
- **WHEN** an admin calls `GET /admin/messages/search?q=hello&page=1&limit=20`
- **THEN** the system SHALL return messages whose content matches `q` ordered by `createdAt` desc

#### Scenario: Search scoped to conversation
- **WHEN** an admin calls `GET /admin/messages/search?q=hello&conversationId=<id>`
- **THEN** results SHALL be limited to that conversation

#### Scenario: Trusted soft-delete
- **WHEN** an admin calls `POST /admin/messages/:id/soft-delete`
- **THEN** the message SHALL be soft-deleted (observable as `deleted:true` or `deletedFor` containing all members) and a `message_deleted` socket event SHALL be emitted to `conversation:<conversationId>`
- **AND** a non-admin SHALL receive 403, nonexistent id 404

#### Scenario: Empty query rejected
- **WHEN** `GET /admin/messages/search` is called without `q`
- **THEN** the system SHALL return 400
