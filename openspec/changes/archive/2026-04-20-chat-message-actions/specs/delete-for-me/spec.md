## ADDED Requirements

### Requirement: Delete message for me only
The system SHALL allow any conversation member to hide a message from their own view without affecting other members. There is no time limit for this action.

#### Scenario: Delete for me
- **WHEN** user selects "Xóa cho tôi" from the delete options
- **THEN** the message is hidden from their view only; other members still see it; the userId is added to the message's `deletedFor` array

#### Scenario: Deleted message not shown on reload
- **WHEN** user re-enters the conversation after deleting a message for themselves
- **THEN** the message is still hidden (filtered by client using `deletedFor`)

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
