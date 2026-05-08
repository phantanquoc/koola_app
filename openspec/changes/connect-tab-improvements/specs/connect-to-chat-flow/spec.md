## ADDED Requirements

### Requirement: BusinessCard always shows both action buttons
`BusinessCard` SHALL always render two action buttons regardless of `isConnected` state:
1. **"Xem hồ sơ"** — always visible; navigates to `BusinessProfileScreen`
2. **"Kết nối ngay"** (when `isConnected: false`) OR **"Nhắn tin"** (when `isConnected: true`) — triggers the connect-to-chat flow

The existing `onPress` prop on the outer `TouchableOpacity` card container MAY be removed or retained; "Xem hồ sơ" button is the primary profile navigation entry point.

#### Scenario: Card shows both buttons when not connected
- **WHEN** a `BusinessCard` is rendered with `business.isConnected = false`
- **THEN** both "Xem hồ sơ" and "Kết nối ngay" buttons are visible

#### Scenario: Card shows both buttons when connected
- **WHEN** a `BusinessCard` is rendered with `business.isConnected = true`
- **THEN** both "Xem hồ sơ" and "Nhắn tin" buttons are visible; "Kết nối ngay" is NOT shown

#### Scenario: Loading state during connect
- **WHEN** the connect action is in progress (`isConnecting: true`)
- **THEN** "Kết nối ngay" / "Nhắn tin" button shows an `ActivityIndicator` and is disabled

### Requirement: BusinessCard component interface adds onMessagePress callback
`BusinessCard` SHALL accept two new optional props:
- `onConnectAndChatPress: () => void` — called when "Kết nối ngay" is tapped (replaces the old `onConnectPress`)
- `onMessagePress: () => void` — called when "Nhắn tin" is tapped

The old `onConnectPress` prop SHALL be removed since its behavior is superseded.

#### Scenario: Prop interface updated
- **WHEN** `BusinessCardProps` is inspected
- **THEN** it contains `onConnectAndChatPress`, `onMessagePress`, and `onPress` (for "Xem hồ sơ"); `onConnectPress` is absent

### Requirement: "Kết nối ngay" triggers connect + create conversation + navigate to ChatScreen
When a user taps "Kết nối ngay" on a `BusinessCard`, the system SHALL:
1. Call `POST /api/businesses/:id/connect` (optimistic UI update: set `isConnected: true`)
2. Call `POST /api/conversations/direct/:ownerId` using `business.ownerId` to create or retrieve a direct conversation
3. Navigate cross-tab to `ChatScreen` with the returned `conversationId`

If step 1 fails, the optimistic update SHALL be rolled back. If step 2 fails, the connection SHALL remain but an error is logged; navigation does NOT proceed.

#### Scenario: Successful connect and chat open
- **WHEN** the user taps "Kết nối ngay" on an unconnected business
- **THEN** the business card updates to show `isConnected: true`, a conversation is created or found, and ChatScreen opens for that conversation

#### Scenario: Connect API failure
- **WHEN** `POST /api/businesses/:id/connect` returns an error
- **THEN** the business card reverts to `isConnected: false` and no navigation occurs

#### Scenario: Conversation creation failure
- **WHEN** `POST /api/conversations/direct/:ownerId` returns an error
- **THEN** `console.warn` is called with the error, navigation does NOT occur, and the connect state is retained

### Requirement: "Nhắn tin" on a connected business opens the existing conversation
When a user taps "Nhắn tin" on a business where `isConnected: true`, the system SHALL:
1. Call `POST /api/conversations/direct/:ownerId` (idempotent — returns existing conversation if one exists)
2. Navigate cross-tab to `ChatScreen` with the returned `conversationId`

#### Scenario: Nhắn tin navigates to chat
- **WHEN** the user taps "Nhắn tin" on a connected BusinessCard
- **THEN** `POST /api/conversations/direct/:ownerId` is called and the app navigates to ChatScreen

### Requirement: Cross-tab navigation from Connect to Chat
Navigation from the Connect tab to ChatScreen SHALL use nested navigation syntax targeting the `ChatTab` bottom tab and the `Chat` screen within `ChatTabStackParamList`.

#### Scenario: ChatScreen opens from Connect tab
- **WHEN** the connect-to-chat flow completes successfully
- **THEN** the bottom tab switches to ChatTab and the Chat screen for the given conversationId is pushed

### Requirement: businessesApi exposes a create method
`businessesApi` in `apiService.ts` SHALL include a `create(dto)` method that posts to `POST /api/businesses` and returns the created `Business` object.

#### Scenario: Create method exists
- **WHEN** `businessesApi.create({ name, relationshipType, category, province })` is called with valid data
- **THEN** it sends `POST /api/businesses` with the DTO body and returns the response data
