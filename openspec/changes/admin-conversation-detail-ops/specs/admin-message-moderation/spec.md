# Spec Delta

## MODIFIED Requirements

### Requirement: Admin can search and soft-delete messages

The system SHALL expose `GET /admin/messages/search` (paginated, `q` required, optional `conversationId` filter) backed by existing MongoDB text index with escaped regex fallback, `POST /admin/messages/:id/soft-delete` (trusted actor, no sender-ownership check) that sets soft-delete state and emits `message_deleted` to the conversation room, and `POST /admin/messages/:id/restore` (trusted actor) that reverses a soft-delete by clearing the deleted flag, emits `message_restored` to the conversation room, and writes an audit entry. Restore SHALL be idempotent: restoring an already-restored message returns success without a second state change or audit entry. Soft-delete and restore SHALL be documented as reversible with each other; UI copy MUST NOT claim the action is unrecoverable.

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

#### Scenario: Restore reverses soft-delete
- **WHEN** an admin calls `POST /admin/messages/:id/restore` on a soft-deleted message
- **THEN** the deleted flag SHALL be cleared, a `message_restored` socket event SHALL be emitted to `conversation:<conversationId>`, an audit entry SHALL be written, and clients that missed the event SHALL observe the change through incremental sync (`updatedAt`)
- **AND** a non-admin SHALL receive 403, nonexistent id 404

#### Scenario: Restore is idempotent
- **WHEN** an admin calls `POST /admin/messages/:id/restore` on a message that is not deleted
- **THEN** the system SHALL return success without changing state and without writing a second audit entry

#### Scenario: Empty query rejected
- **WHEN** `GET /admin/messages/search` is called without `q`
- **THEN** the system SHALL return 400