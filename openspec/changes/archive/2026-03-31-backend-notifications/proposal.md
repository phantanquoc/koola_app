## Why

When a user sends a message to an offline recipient, the recipient has no way to know they received a message until they open the app. Push notifications bridge this gap by alerting users even when the app is not in the foreground. Firebase Cloud Messaging (FCM) handles both Android (FCM) and iOS (via APNs in the same Firebase project) with a single unified API, eliminating the need for a custom push notification server.

## What Changes

This change adds the `notification-push` capability to the NestJS backend:

- **`NotificationsService`**: Centralized service for sending FCM push notifications. Accepts a message payload (sender, content, conversation, type) and builds the correct FCM payload based on message type and conversation type.
- **Redis-based deduplication**: Before sending FCM, checks Redis for a recent notification key (`notif:<userId>:<conversationId>`) with 5-second TTL. If found, skips sending to prevent notification spam during rapid message bursts.
- **Multi-token support**: Sends FCM to all registered tokens for a user (multi-device support). Removes invalid/unregistered tokens from DB on error.
- **Payload builder**: Constructs correct notification title/body for text messages, image messages, and group messages.
- **Integration into message send flow**: `MessagesService.sendMessage()` calls `NotificationsService.sendPushNotification()` when recipients are offline AND `notificationsEnabled === true`.
- **Logout cleanup**: `AuthService.logout()` also removes all FCM tokens for the user (device-level token cleanup via RN client on next login).

## Capabilities

### New Capabilities

- `notification-push`: FCM push notification service integrated into the message send flow. Supports deduplication, multi-token delivery, per-type payload construction, and invalid token cleanup.

### Modified Capabilities

- `messaging` (existing): `MessagesService.sendMessage()` now calls `NotificationsService` after saving the message, checking recipient online status and notification preferences.
- `users` (existing): FCM token management already implemented in `UsersService` (`registerFcmToken`, `removeFcmToken`). No schema changes needed.
- `auth` (existing): `AuthService.logout()` extended to clear FCM tokens on logout.

## Impact

### Backend (NestJS)
- New `notifications` module: `NotificationsService`, `fcm-client.ts`
- Redis used as deduplication cache (key: `notif:{userId}:{conversationId}`, TTL: 5s)
- Firebase Admin SDK initialized lazily (only when Firebase env vars are present)
- Existing `messages` module imports `NotificationsModule`

### External Dependencies
- Firebase project: credentials already in `.env` (`FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`)
- Redis: already provisioned on VM4
