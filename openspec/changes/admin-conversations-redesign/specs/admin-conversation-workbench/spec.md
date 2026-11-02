# Spec Delta

## MODIFIED Requirements

### Requirement: Conversation list with moderation-oriented filters

The system SHALL let an admin browse all conversations with text search on name, type filter (direct/group), pending-report filter, member-count range filter, media filter, activity and creation date ranges, allow-listed sort, and pagination. The list page SHALL persist tab, search, filters, sort, page, and page size in the URL, SHALL show per-tab counts fetched from the server, and SHALL render loading, empty, and error states distinctly with a retry path.

#### Scenario: Filter by type
- **WHEN** an admin calls `GET /admin/conversations?type=group`
- **THEN** only group conversations SHALL be returned

#### Scenario: Filter by pending reports
- **WHEN** an admin calls `GET /admin/conversations?hasPendingReport=true`
- **THEN** only conversations having at least one pending report SHALL be returned

#### Scenario: Filter by member count
- **WHEN** an admin calls `GET /admin/conversations?minMembers=10&maxMembers=50`
- **THEN** only conversations whose member count falls in the range SHALL be returned

#### Scenario: Filter by last-activity range
- **WHEN** an admin calls `GET /admin/conversations?activeFrom=2026-10-01&activeTo=2026-10-31`
- **THEN** only conversations whose `lastMessageAt` falls in that inclusive range SHALL be returned
- **AND** the range SHALL be settable from the list UI (not only via hand-edited URLs)

#### Scenario: Sort by last message
- **WHEN** an admin calls `GET /admin/conversations`
- **THEN** results SHALL be ordered by `lastMessageAt` desc with nulls last

#### Scenario: List state lives in the URL
- **WHEN** an admin sets a tab, search term, filter, sort, page, or page size and reloads the page
- **THEN** the same view SHALL be restored from the URL
- **AND** copying the URL SHALL reopen the identical filtered view for another moderator

#### Scenario: Tab counts come from the server
- **WHEN** the list renders its status tabs
- **THEN** each visible count SHALL come from `GET /admin/conversations/stats` rather than from the loaded page
- **AND** a count of zero SHALL not be displayed

#### Scenario: Load failure offers retry
- **WHEN** the conversation list request fails
- **THEN** the page SHALL show an error state naming the failure with a retry control that re-issues the request

#### Scenario: Row opens the detail route
- **WHEN** an admin activates a conversation row
- **THEN** the app SHALL navigate to `/conversations/:id` carrying the current list URL so a back action returns to the same filtered view

## REMOVED Requirements

### Requirement: Conversation detail drawer for moderation

**Reason**: The drawer violates the standing decision that admin detail views are shareable routes or short overlays — a conversation transcript always exceeds one screen, and a drawer hides the list without producing a link another moderator can open.

**Migration**: Moderators open `/conversations/:id` instead. Links that previously targeted `/conversations?focus=<id>` SHALL resolve to that route, and "Back" SHALL return to the exact list filter via the list URL carried in navigation state.

## ADDED Requirements

### Requirement: Conversation detail route for moderation

The admin panel SHALL provide a shareable route `/conversations/:id` containing a header with type, member, and pending-report badges (using the conversation avatar when it has a valid http(s) URL), a description list with technical details (including the creator id) behind a disclosure, member list with role badges, joined-at date, and account-type hint linking to member profiles, a pinned-messages section resolved to content and pinner name when the conversation has pins, recent messages read-only with soft-deleted messages dimmed and badged, reply quotes and reaction tallies rendered as moderation context, per-message pending-report badges, message soft-delete behind confirmation, related pending reports loaded by `targetId` with inline resolve/dismiss **behind a confirmation dialog**, a report history section (already-resolved/dismissed reports of the same `targetId`), and no control that has no effect.

#### Scenario: Route shows members and messages
- **WHEN** an admin opens `/conversations/:id`
- **THEN** the page SHALL show each member with role badge and the 20 most recent messages with sender, time, and content
- **AND** opening the same URL in a new tab SHALL load the same conversation

#### Scenario: Soft-deleted message is visibly marked
- **WHEN** a message in the route has `deleted:true`
- **THEN** it SHALL render dimmed with a "Removed" badge instead of normal content

#### Scenario: Soft-delete requires confirmation
- **WHEN** an admin clicks remove on a message
- **THEN** a confirmation dialog SHALL appear before the `POST /admin/messages/:id/soft-delete` call, and success SHALL show a toast and update the message row

#### Scenario: Reports are scoped to this conversation
- **WHEN** an admin opens a conversation with pending reports
- **THEN** the page SHALL fetch reports with `targetType=conversation` and `targetId=<id>` rather than a page of all conversation reports
- **AND** resolving or dismissing SHALL require a confirmation dialog before the POST, then update in place with a toast and no navigation

#### Scenario: Report history of this conversation is visible
- **WHEN** an admin opens a conversation that previously had resolved or dismissed reports
- **THEN** a history section SHALL list those reports (status label, reason, resolver, time), scoped by the same `targetId`, without mixing them into the pending queue

#### Scenario: Pinned messages resolve to content
- **WHEN** the detail response contains `pinnedMessages`
- **THEN** the page SHALL show each pin's content (or a deleted/unavailable note), pinner display name, and pinned time — never a bare messageId

#### Scenario: Reply and reaction context renders
- **WHEN** a shown message has `replyToPreview` or `reactions`
- **THEN** the page SHALL render the quoted reply (sender + snippet) and an emoji tally with counts as part of the message bubble

#### Scenario: Reported message is badged
- **WHEN** the detail response reports pending message reports for a shown message
- **THEN** that message SHALL display a pending-report badge with its count

#### Scenario: No non-functional control is rendered
- **WHEN** an admin inspects the detail actions
- **THEN** every rendered control SHALL perform a real action; a delete-conversation control SHALL only appear once an endpoint exists

#### Scenario: Back returns to the originating filter
- **WHEN** an admin follows a row from the list and then activates Back
- **THEN** the list SHALL restore the tab, search, filters, sort, and page that were active before navigating