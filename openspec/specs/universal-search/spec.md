# universal-search Specification

## Purpose
Defines the mobile Universal Search screen, which provides a unified search experience across conversations, contacts, and messages in a single full-screen interface.

## Requirements
### Requirement: Universal Search Screen Entry Point
The system SHALL navigate to a full-screen `UniversalSearchScreen` when the user taps the search bar in `KoolaHeader`.

#### Scenario: Search bar tap opens search screen
- **WHEN** user taps the search bar in KoolaHeader on ChatHomeScreen
- **THEN** client navigates to `UniversalSearchScreen` via `ChatTabStack` push
- **AND** the screen mounts with the TextInput auto-focused and keyboard visible

#### Scenario: Back navigation closes search screen
- **WHEN** user presses the back button or hardware back on UniversalSearchScreen
- **THEN** client navigates back to ChatHomeScreen
- **AND** the keyboard is dismissed

### Requirement: Unified Search Input
The `UniversalSearchScreen` SHALL provide a single text input that drives all three search categories simultaneously.

#### Scenario: Query below minimum length shows empty state
- **WHEN** the text input contains fewer than 2 characters
- **THEN** no API calls are made
- **AND** the screen displays an empty state with prompt "Nhập từ khóa để tìm kiếm"

#### Scenario: Query at or above minimum triggers debounced search
- **WHEN** the text input contains 2 or more characters and 300 ms have elapsed since the last keystroke
- **THEN** the client simultaneously filters conversations (client-side), calls `GET /users/search?q=`, and calls `GET /messages/search?q=`

#### Scenario: Query cleared resets all results
- **WHEN** user clears the text input to 0 characters
- **THEN** all result sections clear and the empty state is shown again

#### Scenario: Clear button dismisses query
- **WHEN** the text input is non-empty and user taps the X clear button
- **THEN** the input is emptied and all results reset to the empty state

### Requirement: Grouped Result Sections
The screen SHALL display results in three labelled sections: "Cuộc trò chuyện", "Liên hệ", "Tin nhắn", each with independent loading and empty states.

#### Scenario: Loading state per section
- **WHEN** an API call for a section is in-flight
- **THEN** that section shows an activity indicator while the other sections may already show results

#### Scenario: Section with no results
- **WHEN** a section's data source returns zero matches
- **THEN** that section shows "Không tìm thấy kết quả" inline below its label

#### Scenario: Section collapsed to 3 results
- **WHEN** a section returns more than 3 results
- **THEN** only the first 3 results are shown
- **AND** a "Xem thêm" button is rendered below the 3 results

#### Scenario: Expand section on "Xem thêm" tap
- **WHEN** user taps "Xem thêm" in a section
- **THEN** the section expands to show up to 20 results (one full page)
- **AND** the "Xem thêm" button is replaced by results

### Requirement: Conversation Result Item
The "Cuộc trò chuyện" section SHALL display matching conversations filtered client-side from the in-memory conversation list.

#### Scenario: Conversation matches on name
- **WHEN** the search query matches the conversation's `name` field (case-insensitive, partial match)
- **THEN** the conversation appears in the "Cuộc trò chuyện" section

#### Scenario: Conversation matches on member display name
- **WHEN** the search query matches any member's `displayName` in the conversation (case-insensitive, partial match)
- **THEN** that conversation appears in the "Cuộc trò chuyện" section

#### Scenario: Tap conversation result navigates to Chat
- **WHEN** user taps a conversation result item
- **THEN** client navigates to `ChatScreen` with the conversation's `conversationId`

### Requirement: Contact Result Item
The "Liên hệ" section SHALL display users returned by `GET /users/search?q=`.

#### Scenario: Contact shows avatar and name
- **WHEN** a user result is rendered
- **THEN** the item shows the user's avatar (or initials fallback), `displayName`, and `phone`

#### Scenario: Tap contact navigates to profile
- **WHEN** user taps a contact result item
- **THEN** client navigates to `ProfileScreen` with the user's `userId`

### Requirement: Message Result Item
The "Tin nhắn" section SHALL display messages returned by `GET /messages/search?q=`.

#### Scenario: Message result shows context
- **WHEN** a message result is rendered
- **THEN** the item shows: sender display name, a content snippet (max 80 chars), conversation name, and relative timestamp

#### Scenario: Tap message result navigates to Chat
- **WHEN** user taps a message result item
- **THEN** client navigates to `ChatScreen` with the message's `conversationId`
