## ADDED Requirements

### Requirement: Send Push Notification
The system SHALL send a Firebase Cloud Messaging push notification when a message is sent to an offline user.

#### Scenario: Send FCM to offline recipient
- **WHEN** user A sends a message to user B and user B's WebSocket is not connected
- **THEN** NestJS sends FCM notification to user B's registered FCM tokens with `{ title: "A", body: "<message preview>", data: { conversationId, messageId, type: "new_message" } }`

#### Scenario: FCM to multiple tokens
- **WHEN** user B is logged in on multiple devices with multiple FCM tokens
- **THEN** NestJS sends FCM to all registered tokens for that user

#### Scenario: FCM delivery failure
- **WHEN** FCM returns an error (invalid token, unregistered device)
- **THEN** NestJS removes invalid FCM tokens from the user's token list

### Requirement: Register FCM Token
The system SHALL allow the client to register and update FCM push tokens.

#### Scenario: Register FCM token
- **WHEN** authenticated user calls PUT /users/me/fcm-token with `{ fcmToken: "<token>", platform: "android" }`
- **THEN** server adds or updates token in user's `fcmTokens` array

#### Scenario: Register iOS FCM token
- **WHEN** iOS user registers FCM token
- **THEN** server stores token with `platform: "ios"`, associates with APNs configuration in Firebase project

#### Scenario: Remove FCM token on logout
- **WHEN** user logs out (POST /auth/logout)
- **THEN** server removes all FCM tokens associated with that user's session/device

### Requirement: Notification Payload
The system SHALL construct FCM notification payloads with appropriate content.

#### Scenario: Text message notification
- **WHEN** FCM notification is sent for a text message
- **THEN** payload is `{ notification: { title: "<senderName>", body: "<messageContent truncated to 100 chars>" }, data: { conversationId, messageId, type: "new_message" } }`

#### Scenario: Image message notification
- **WHEN** FCM notification is sent for an image message
- **THEN** payload is `{ notification: { title: "<senderName>", body: "📷 Photo" }, data: { conversationId, messageId, type: "new_message" } }`

#### Scenario: Group message notification
- **WHEN** FCM notification is sent for a group message
- **THEN** payload is `{ notification: { title: "<groupName>", body: "<senderName>: <messagePreview>" }, data: { conversationId, messageId, type: "new_message" } }`

#### Scenario: Notification deduplication
- **WHEN** multiple messages are sent to an offline user in quick succession (within 5 seconds)
- **THEN** system sends only one FCM notification per conversation with `{ body: "X new messages" }`

### Requirement: Notification Preferences
The system SHALL allow users to configure notification settings.

#### Scenario: User disables notifications
- **WHEN** user sets `notificationsEnabled: false` via PUT /users/me/settings
- **THEN** server skips FCM sending for that user; messages are still stored and delivered on reconnect

#### Scenario: User disables group notifications
- **WHEN** user disables notifications for a specific conversation
- **THEN** server skips FCM for that conversation only
