## MODIFIED Requirements

### Requirement: Delete message for me only
The system SHALL allow any conversation member to hide a message from their own view without affecting other members. There is no time limit for this action. The `deletedFor` filter SHALL apply to both initial conversation load and paginated (older) loads. On REST failure, the client SHALL restore the optimistically-removed message and surface an error toast.

#### Scenario: Delete for me
- **WHEN** user selects "Xóa cho tôi" from the delete options
- **THEN** the message is hidden from their view only; other members still see it; the userId is added to the message's `deletedFor` array

#### Scenario: Deleted message not shown on reload
- **WHEN** user re-enters the conversation after deleting a message for themselves
- **THEN** the message is still hidden (filtered by client using `deletedFor`)

#### Scenario: Deleted message not shown when loading older messages
- **WHEN** user scrolls up to load older messages via `loadEarlier` pagination
- **THEN** messages whose `deletedFor` includes the current user SHALL be filtered out of the appended page; they do not reappear in the list

#### Scenario: Delete-for-me REST failure rollback
- **WHEN** client optimistically removes a message from the UI and the DELETE /messages/:id/for-me REST call fails (network error, HTTP 5xx)
- **THEN** the client re-inserts the message at its original position in the list and shows a toast "Không thể xóa tin nhắn. Vui lòng thử lại."

#### Scenario: Delete-for-everyone REST failure rollback
- **WHEN** sender optimistically removes their message for everyone and the DELETE call fails
- **THEN** the client re-inserts the message and shows a toast with the error; the message is NOT permanently lost from the sender's UI

### Requirement: Delete message for everyone (existing behavior enhanced)
The system SHALL continue to support "Delete for everyone" with existing rules: sender only, within 24 hours. When selected, the message shows "Tin nhắn đã bị xóa" for all members.

#### Scenario: Sender deletes for everyone within 24h
- **WHEN** the sender selects "Xóa cho mọi người" within 24 hours of sending
- **THEN** the message is soft-deleted, all members see "Tin nhắn đã bị xóa"

#### Scenario: Sender tries to delete for everyone after 24h
- **WHEN** the sender selects "Xóa cho mọi người" after 24 hours
- **THEN** an Alert shows "Chỉ có thể xóa cho mọi người trong 24 giờ"

#### Scenario: Non-sender sees delete options
- **WHEN** a non-sender long presses a message and taps Delete
- **THEN** only "Xóa cho tôi" option is shown (no "Xóa cho mọi người")
