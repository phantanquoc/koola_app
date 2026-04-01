## ADDED Requirements

### Requirement: User Search by Name or Email
The React Native client SHALL allow authenticated users to search for other users by entering a query of at least 2 characters, matching against email addresses or display names (case-insensitive).

#### Scenario: Successful search with results
- **WHEN** user enters a query of 2+ characters in the search bar
- **THEN** client calls `GET /users/search?q=<query>` with debounce (300ms)
- **AND** server returns up to 20 users matching email OR displayName (case-insensitive partial match)
- **AND** results exclude the authenticated user

#### Scenario: Search with no results
- **WHEN** user enters a query that matches no users
- **THEN** client displays an empty state: "No users found for '<query>'"

#### Scenario: Search query too short
- **WHEN** user enters a query of fewer than 2 characters
- **THEN** client does NOT call the search API
- **AND** client displays the default empty state: "Search for people by name or email"

#### Scenario: Search result pagination
- **WHEN** more than 20 users match the query
- **THEN** server returns `{ items: User[], hasMore: true, nextCursor: <lastUserId> }`
- **AND** client shows a "Load more" button or scrolls to load next page

#### Scenario: Search with special characters
- **WHEN** user enters a query containing special regex characters (e.g., `john@`)
- **THEN** server sanitizes the query and returns matching users without throwing an error

#### Scenario: Search while already viewing results
- **WHEN** user clears the search query (query length becomes 0)
- **THEN** client clears the results list and returns to the default empty state

### Requirement: Direct Conversation Creation
The system SHALL provide an endpoint to find or create a direct 1-on-1 conversation between two users.

#### Scenario: Find existing direct conversation
- **WHEN** user calls `POST /conversations/direct/:userId` and a direct conversation already exists between the two users
- **THEN** server returns the existing conversation object with `type: "direct"`
- **AND** HTTP 200 is returned

#### Scenario: Create new direct conversation
- **WHEN** user calls `POST /conversations/direct/:userId` and no direct conversation exists
- **THEN** server creates a new conversation with `type: "direct"`, `members: [currentUser, targetUser]`
- **AND** server returns the newly created conversation object
- **AND** HTTP 201 is returned

#### Scenario: Start DM with self
- **WHEN** user calls `POST /conversations/direct/:selfId`
- **THEN** server returns HTTP 400 with message "Cannot message yourself"

#### Scenario: Start DM with non-existent user
- **WHEN** user calls `POST /conversations/direct/:invalidUserId`
- **THEN** server returns HTTP 404 with message "User not found"

#### Scenario: Navigate to chat from contact tap
- **WHEN** user taps a contact in the search results
- **THEN** client calls `POST /conversations/direct/:userId` to get the conversation
- **AND** client navigates to ChatScreen with the returned conversation ID

### Requirement: Contact Item Display
The React Native client SHALL display search results as tappable contact items showing user identity and online presence.

#### Scenario: Contact item with avatar
- **WHEN** a search result has an `avatar` URL
- **THEN** client renders a circular avatar image

#### Scenario: Contact item without avatar
- **WHEN** a search result has no `avatar`
- **THEN** client renders initials avatar — first letter of `displayName`, uppercase, on a colored background

#### Scenario: Contact item with online status
- **WHEN** a search result has `isOnline: true`
- **THEN** client renders a green dot (rgb(76, 175, 80)) next to the avatar
- **WHEN** a search result has `isOnline: false`
- **THEN** client renders a gray dot (rgb(189, 189, 189))

#### Scenario: Tap contact to start chat
- **WHEN** user taps a contact item
- **THEN** client navigates to the chat screen for that conversation
- **AND** the navigation passes `conversationId` from the find-or-create response

### Requirement: User Profile View
The React Native client SHALL display a full profile screen for any user, showing identity, contact info, and a call-to-action to start chatting.

#### Scenario: Display user profile
- **WHEN** user navigates to a user's profile screen
- **THEN** client displays: avatar (or initials), `displayName`, `email`, online/offline status with last-seen timestamp

#### Scenario: Start chat from profile
- **WHEN** user taps "Start Chat" on the profile screen
- **THEN** client calls `POST /conversations/direct/:userId`
- **AND** navigates to ChatScreen with the returned conversation ID
- **AND** navigates back to the contacts screen
