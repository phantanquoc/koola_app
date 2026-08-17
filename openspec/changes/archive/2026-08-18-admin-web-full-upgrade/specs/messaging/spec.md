## ADDED Requirements

### Requirement: Admin trusted soft-delete for messages

The messaging capability SHALL support an admin-only soft-delete path `POST /admin/messages/:id/soft-delete` that marks the message as deleted from the perspective of all participants (without requiring sender ownership or 24h window) and emits `message_deleted` to the owning conversation room. The regular user delete path (`DELETE /conversations/:convId/messages/:msgId`) remains sender-only + 24h constrained.

#### Scenario: Admin bypasses sender check
- **WHEN** an admin soft-deletes a message sent by another user
- **THEN** the operation SHALL succeed and the message SHALL appear deleted to that conversation's members

#### Scenario: User path still enforced
- **WHEN** a non-admin user calls `DELETE /conversations/:convId/messages/:msgId` for another user's message
- **THEN** the system SHALL return 403
