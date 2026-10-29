## ADDED Requirements

### Requirement: Long-press action sheet on conversation list
The mobile Chat tab conversation list SHALL open an action sheet when the user long-presses a conversation row. The sheet SHALL be rendered as an in-tree absolute overlay (not a native `<Modal>`) and SHALL contain exactly three actions in this order: pin toggle, mute toggle, clear conversation. A normal tap on the row SHALL keep opening the chat exactly as before.

#### Scenario: Long-press opens the sheet
- **WHEN** the user long-presses a conversation row
- **THEN** an action sheet appears showing the conversation's display name and the rows "Ghim" (or "Bỏ ghim" if pinned), "Tắt thông báo" (or "Bật thông báo" if currently muted), and "Xoá hội thoại" (destructive tone)

#### Scenario: Tap behaviour unchanged
- **WHEN** the user taps (not long-presses) a conversation row
- **THEN** the chat screen opens with the same navigation params as before this change and no sheet appears

#### Scenario: Dismiss the sheet
- **WHEN** the sheet is open and the user taps the backdrop or presses the Android hardware Back button
- **THEN** the sheet closes, no action is performed, and Back does not navigate away from the list

#### Scenario: Screen-reader access without long-press
- **WHEN** a screen-reader user focuses a conversation row
- **THEN** the row exposes accessibility actions for pin/unpin, mute/unmute, and clear conversation that perform the same operations as the sheet

### Requirement: Existing conversation list UI is preserved
The change SHALL be additive only. The existing conversation row, list, Chat Home header, sub-tabs and dock SHALL keep their current layout, dimensions, colours, spacing, typography and tap behaviour. The only visual additions to a row SHALL be a pin icon and a muted-bell icon placed next to the timestamp, each rendered only when that state is active.

#### Scenario: Row without active prefs is visually identical
- **WHEN** a conversation is neither pinned nor muted
- **THEN** its row renders with the same element tree, styles and dimensions as before this change (no placeholder space reserved for icons)

#### Scenario: Indicators shown only when active
- **WHEN** a conversation is pinned and/or currently muted
- **THEN** the row shows a 14px pin icon and/or a 14px muted-bell icon in the muted text colour immediately before the timestamp, without changing row height

### Requirement: Pin conversation per user
The system SHALL let a user pin or unpin a conversation for themselves only via `PATCH /conversations/:id/prefs` with `{ pinned: boolean }`. A user SHALL have at most 5 pinned conversations. Pinned conversations SHALL be listed before unpinned ones.

#### Scenario: Pin a conversation
- **WHEN** a member with fewer than 5 pinned conversations sends `{ pinned: true }`
- **THEN** the server sets `pinnedAt = now` on that user's UserConversation, returns the updated prefs, and the conversation moves to the pinned group at the top of that user's list

#### Scenario: Pin limit reached
- **WHEN** a member who already has 5 pinned conversations sends `{ pinned: true }` for a sixth
- **THEN** the server responds 400 with code `PIN_LIMIT_REACHED`, nothing is changed, and the mobile app reverts the optimistic state and shows the toast "Chỉ ghim tối đa 5 hội thoại"

#### Scenario: Unpin a conversation
- **WHEN** a member sends `{ pinned: false }`
- **THEN** the server sets `pinnedAt = null` and the conversation returns to normal `lastMessageAt` ordering

#### Scenario: Pin is private
- **WHEN** user A pins a conversation shared with user B
- **THEN** user B's list ordering and prefs are unchanged

### Requirement: Mute conversation notifications per user
The system SHALL let a user mute a conversation for themselves via `PATCH /conversations/:id/prefs` with `muteDuration` ∈ {`1h`, `8h`, `24h`, `forever`, `off`}. While `mutedUntil > now` the user SHALL NOT receive FCM new-message pushes for that conversation, but SHALL still receive messages and socket events normally. Incoming call pushes and Moments mention pushes (not conversation-scoped) are unaffected.

#### Scenario: Mute for a duration
- **WHEN** a member sends `{ muteDuration: "8h" }`
- **THEN** the server sets `mutedUntil = now + 8 hours` and returns it

#### Scenario: Mute until turned back on
- **WHEN** a member sends `{ muteDuration: "forever" }`
- **THEN** the server sets `mutedUntil` to the sentinel `9999-12-31T23:59:59.999Z`

#### Scenario: Unmute
- **WHEN** a member sends `{ muteDuration: "off" }`
- **THEN** the server sets `mutedUntil = null`

#### Scenario: Muted recipient gets no push
- **WHEN** a message is sent in a conversation where recipient R has `mutedUntil > now` and R is otherwise push-eligible (offline, has tokens, notifications enabled)
- **THEN** no FCM push is sent to R for that message, while other eligible recipients still receive theirs

#### Scenario: Expired mute behaves as unmuted
- **WHEN** R's `mutedUntil` is in the past
- **THEN** R receives pushes as normal and the mobile row shows no muted icon and the sheet shows "Tắt thông báo"

#### Scenario: Choosing a mute duration on mobile
- **WHEN** the user taps "Tắt thông báo" in the sheet
- **THEN** the sheet shows the options "Trong 1 giờ", "Trong 8 giờ", "Trong 24 giờ", "Cho đến khi tôi bật lại"; choosing one applies it and closes the sheet; tapping "Bật thông báo" on a muted conversation unmutes immediately without a sub-menu

### Requirement: Clear conversation for me
The system SHALL let a member clear a conversation for themselves via `POST /conversations/:id/clear`. Clearing SHALL set the caller's `clearedAt = now`, reset their `unreadCount` to 0, unpin it, and hide the conversation from their list until a newer message is persisted. Clearing SHALL NOT delete messages, SHALL NOT affect other members, and SHALL NOT remove the caller from a group.

#### Scenario: Confirm before clearing
- **WHEN** the user taps "Xoá hội thoại" in the sheet
- **THEN** a destructive confirm dialog titled "Xoá hội thoại?" with message "Lịch sử trò chuyện sẽ bị xoá ở phía bạn. Người khác vẫn giữ tin nhắn." appears; only confirming calls the endpoint

#### Scenario: Cleared conversation leaves the list
- **WHEN** the clear succeeds
- **THEN** the conversation row and all its local messages are removed from the device's SQLite store and the row disappears from the list

#### Scenario: History hidden for the clearer only
- **WHEN** the clearer later opens the conversation (via a new message or search)
- **THEN** only messages created after `clearedAt` are returned to them, while other members still see the full history

#### Scenario: In-chat call cards respect the clear point
- **WHEN** the clearer's app requests call history scoped to that conversation (`GET /call-logs?conversationId=...`)
- **THEN** only calls with `startedAt > clearedAt` are returned; the unscoped call history (Calls tab) is unchanged

#### Scenario: Group membership kept
- **WHEN** a member clears a group conversation
- **THEN** they remain a member and continue to receive new group messages

#### Scenario: New message un-hides
- **WHEN** any new message is persisted in a cleared conversation
- **THEN** the conversation reappears in the clearer's list (on the next list fetch) showing only post-clear history

### Requirement: Prefs endpoints enforce membership and validation
Both endpoints SHALL require authentication and membership, and SHALL validate input with a DTO.

#### Scenario: Non-member
- **WHEN** a user who is not a member calls either endpoint
- **THEN** the server responds 404 Not Found and changes nothing

#### Scenario: Invalid body
- **WHEN** `PATCH /prefs` receives an unknown `muteDuration` value, a non-boolean `pinned`, or neither field
- **THEN** the server responds 400 and changes nothing

### Requirement: Cross-device prefs sync
After any successful prefs change or clear, the server SHALL emit `conversation_prefs_updated` with `{ conversationId, pinned, mutedUntil, clearedAt }` to the caller's `user:<id>` room only.

#### Scenario: Other device converges
- **WHEN** the user pins, mutes or clears on device 1
- **THEN** device 2 (same user) receives `conversation_prefs_updated`, updates its SQLite row (or deletes the row and messages created at or before `clearedAt` for a clear), and the list re-renders without a REST refetch

#### Scenario: Not leaked to other members
- **WHEN** user A changes prefs
- **THEN** no other user's sockets receive the event

### Requirement: Optimistic update with rollback
The mobile app SHALL apply pin and mute changes to local state immediately, and roll back on API failure. Clear SHALL be applied locally only after the server confirms. None of these actions SHALL be queued offline.

#### Scenario: API failure rolls back
- **WHEN** a pin or mute request fails (network error or non-2xx other than PIN_LIMIT_REACHED)
- **THEN** the local row reverts to its previous state and a toast shows "Không thể cập nhật hội thoại. Thử lại."

#### Scenario: Clear failure
- **WHEN** the clear request fails
- **THEN** the row and messages remain untouched and a toast shows "Không thể xoá hội thoại. Thử lại."

#### Scenario: Prefs survive REST refresh
- **WHEN** the conversation list is refetched from REST after a pin or mute
- **THEN** the SQLite rows keep the server's `pinned`/`mutedUntil` values (no write path resets them to defaults)
