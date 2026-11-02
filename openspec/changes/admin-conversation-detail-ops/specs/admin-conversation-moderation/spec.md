# Spec Delta

## ADDED Requirements

### Requirement: Conversation detail operations (admin)

The system SHALL expose admin-only operational endpoints on the conversation detail surface: unpin a message, update the conversation's internal note, and manage group membership (change member role, kick member). Every mutating call SHALL be guarded by the admin controller guard and SHALL write an audit entry; the detail endpoint SHALL accept an optional `senderId` filter so the transcript can be narrowed to one participant server-side.

#### Scenario: Admin unpin mirrors the user pin route
- **WHEN** an admin calls `DELETE /admin/conversations/:id/pin/:messageId`
- **THEN** the pin SHALL be removed from the conversation, an audit entry SHALL be written, and the response SHALL confirm the removal
- **WHEN** the pin does not exist
- **THEN** the system SHALL return 404

#### Scenario: Internal note update
- **WHEN** an admin calls `PATCH /admin/conversations/:id/note` with `{ "note": "đang theo dõi spam" }`
- **THEN** the conversation SHALL persist the note (maximum 500 characters; longer input rejected with 400), return the updated conversation, and write an audit entry
- **WHEN** `note` is an empty string
- **THEN** the note SHALL be cleared and the audit entry SHALL still be written

#### Scenario: Change member role (group only)
- **WHEN** an admin calls `POST /admin/conversations/:id/members/:userId/role` with `{ "role": "admin" }` on a group conversation
- **THEN** the member's conversation role SHALL be updated and an audit entry SHALL be written
- **WHEN** the conversation is direct, the role value is outside `member|admin`, or the user is not a member
- **THEN** the system SHALL return 400 (role/member) or 404 (unknown conversation)

#### Scenario: Kick member (group only)
- **WHEN** an admin calls `DELETE /admin/conversations/:id/members/:userId` on a group conversation
- **THEN** the member SHALL be removed from the conversation and an audit entry SHALL be written
- **WHEN** the conversation is direct or the user is not a member
- **THEN** the system SHALL return 400 or 404 accordingly

#### Scenario: Detail filter by sender
- **WHEN** an admin calls `GET /admin/conversations/:id?senderId=<userId>`
- **THEN** `recentMessages` SHALL contain only messages sent by that user in this conversation (same limit/`before` pagination as unfiltered)
- **WHEN** `senderId` is absent
- **THEN** behavior SHALL be unchanged

#### Scenario: Non-admin blocked
- **WHEN** a non-admin calls any endpoint in this requirement
- **THEN** the system SHALL return 403