# Spec Delta

## Purpose

Gives admins a single workbench to browse, filter, inspect, and moderate chat conversations without leaving the page or switching tools.

## ADDED Requirements

### Requirement: Conversation list with moderation-oriented filters

The system SHALL let an admin browse all conversations with text search on name, type filter (direct/group), pending-report filter, member-count range filter, sort by last message time, and pagination.

#### Scenario: Filter by type

- **WHEN** an admin calls `GET /admin/conversations?type=group`
- **THEN** only group conversations SHALL be returned

#### Scenario: Filter by pending reports

- **WHEN** an admin calls `GET /admin/conversations?hasPendingReport=true`
- **THEN** only conversations having at least one pending report SHALL be returned

#### Scenario: Filter by member count

- **WHEN** an admin calls `GET /admin/conversations?minMembers=10&maxMembers=50`
- **THEN** only conversations whose member count falls in the range SHALL be returned

#### Scenario: Sort by last message

- **WHEN** an admin calls `GET /admin/conversations`
- **THEN** results SHALL be ordered by `lastMessageAt` desc with nulls last

### Requirement: Conversation detail drawer for moderation

The admin panel SHALL show a detail drawer for a conversation containing member list with role badges, recent messages read-only with soft-deleted messages dimmed and badged, message soft-delete behind confirmation, related pending reports with inline resolve/dismiss, and a disabled delete-conversation button marked as coming soon.

#### Scenario: Drawer shows members and messages

- **WHEN** an admin opens a conversation
- **THEN** the drawer SHALL show each member with role badge and the 20 most recent messages with sender, time, and content

#### Scenario: Soft-deleted message is visibly marked

- **WHEN** a message in the drawer has `deleted:true`
- **THEN** it SHALL render dimmed with a "Removed" badge instead of normal content

#### Scenario: Soft-delete requires confirmation

- **WHEN** an admin clicks remove on a message
- **THEN** a confirmation dialog SHALL appear before the `POST /admin/messages/:id/soft-delete` call, and success SHALL show a toast and update the message row

#### Scenario: Reports resolved inline

- **WHEN** an admin resolves or dismisses a related report from the drawer
- **THEN** the report status SHALL update in place with a toast and no page navigation

#### Scenario: Delete conversation is visibly unavailable

- **WHEN** an admin views the drawer actions
- **THEN** the delete-conversation button SHALL be disabled with a tooltip explaining it is coming soon
