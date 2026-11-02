# Spec Delta

## MODIFIED Requirements

### Requirement: Conversation detail route for moderation

The admin panel SHALL provide a shareable route `/conversations/:id` containing a header with type, member, and pending-report badges (using the conversation avatar when it has a valid http(s) URL), a description list with technical details (including the creator id) behind a disclosure, an editable internal note for the moderation team, a pinned-messages section resolved to content and pinner name when the conversation has pins (with an audited unpin action per pin), a member list with role badges, joined-at date, and account-type hint linking to member profiles — for group conversations the chips SHALL offer role-change and kick controls — recent messages read-only with soft-deleted messages dimmed and badged plus a restore action behind confirmation, a sender filter that narrows the stream server-side, reply quotes and reaction tallies rendered as moderation context, per-message pending-report badges that lazily load that message's pending reports and resolve or dismiss them in place behind a confirmation dialog, a previous/next reported-message jump, message soft-delete behind confirmation, conversation-level pending reports loaded by `targetId` with inline resolve/dismiss behind a confirmation dialog, a report history section (already-resolved/dismissed reports of the same `targetId`) with deep links to `/reports/:id`, corrected copy (no stale guidance telling the moderator to open the message elsewhere to remove it), and no control that has no effect.

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

#### Scenario: Soft-deleted message can be restored
- **WHEN** an admin activates the restore action on a soft-deleted message row
- **THEN** a confirmation dialog SHALL appear before `POST /admin/messages/:id/restore`, and success SHALL update the row in place with a toast; the dialog copy SHALL state the action is reversible

#### Scenario: Reports are scoped to this conversation
- **WHEN** an admin opens a conversation with pending reports
- **THEN** the page SHALL fetch reports with `targetType=conversation` and `targetId=<id>` rather than a page of all conversation reports
- **AND** resolving or dismissing SHALL require a confirmation dialog before the POST, then update in place with a toast and no navigation

#### Scenario: Per-message reports resolve in place
- **WHEN** an admin activates a per-message pending-report badge
- **THEN** the page SHALL lazily fetch that message's pending reports with `targetType=message` and `targetId=<messageId>` and allow resolve/dismiss behind a confirmation dialog without leaving the route
- **AND** success SHALL refresh the badge count and the conversation-level list caches

#### Scenario: Reported-message jump
- **WHEN** the detail response reports pending message reports for one or more shown messages
- **THEN** controls SHALL move the view to the previous/next reported message among those shown, using the same scroll behavior as the find bar

#### Scenario: Sender filter narrows the stream
- **WHEN** an admin selects a member in the sender filter
- **THEN** the message stream SHALL be re-fetched with that conversation's `senderId` filter and SHALL show only that sender's messages
- **AND** clearing the filter SHALL restore the unfiltered stream

#### Scenario: Unpin from the pinned section
- **WHEN** an admin removes a pin from the "Đã ghim" section
- **THEN** a confirmation dialog SHALL appear, the audited admin unpin endpoint SHALL be called, and the pin card SHALL disappear on success

#### Scenario: Internal note is saved and audited
- **WHEN** an admin edits and saves the conversation internal note
- **THEN** the note SHALL persist on the conversation (≤500 characters), a toast SHALL confirm, and an audit entry SHALL be written
- **AND** the note SHALL appear on the next load of the same route for any admin

#### Scenario: Member role change and kick are group-only
- **WHEN** an admin changes a member's role or kicks a member from a group conversation
- **THEN** each action SHALL require a confirmation dialog, call the audited admin endpoint, and update the member list in place
- **WHEN** the conversation is a direct (1-1) conversation
- **THEN** the role and kick controls SHALL NOT be rendered, and the endpoints SHALL reject with 400 if called

#### Scenario: Report history of this conversation is visible
- **WHEN** an admin opens a conversation that previously had resolved or dismissed reports
- **THEN** a history section SHALL list those reports (status label, reason, resolver, time), scoped by the same `targetId`, without mixing them into the pending queue
- **AND** each history entry SHALL link to `/reports/:id` for full context

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