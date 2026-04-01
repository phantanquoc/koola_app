## backend-notifications — Implementation Tasks

---

### 8.1 — Firebase Admin Client

- [ ] 8.1.1 Create `src/notifications/fcm-client.ts`: lazy initialization of `firebase-admin`
- [ ] 8.1.2 Replace `\n` in `FIREBASE_PRIVATE_KEY` env var with actual newlines
- [ ] 8.1.3 Export `getFirebaseApp(): admin.app.App` — creates singleton on first call
- [ ] 8.1.4 Handle missing Firebase config gracefully: if env vars absent, throw `ServiceUnavailableException` with message `'Firebase not configured'`

---

### 8.2 — Notifications Service — Core

- [ ] 8.2.1 Create `src/notifications/notifications.service.ts`
- [ ] 8.2.2 Inject `UsersService` (via `forwardRef`), `ConversationsService` (via `forwardRef`)
- [ ] 8.2.3 Create `RedisClientService` or inject `ioredis` directly for deduplication
- [ ] 8.2.4 Create `sendPushNotification(params)` method:
  ```
  params: { senderId, senderName, conversationId, conversationType,
            messageId, messageType, messageContent, recipientIds }
  ```
- [ ] 8.2.5 Inside `sendPushNotification()`:
  1. For each recipientId (skip if senderId === recipientId):
     - Check `notificationsEnabled` for this user
     - Check `isOnline` for this user → if online, skip
     - Redis dedup check: `SET notif:{recipientId}:{conversationId} timestamp EX 5 NX` → if key exists, skip
     - Build FCM payload using `buildPayload()`
     - Send FCM to all tokens in `user.fcmTokens`
     - On `UNREGISTERED`/`INVALID_ARGUMENT` error → remove token from DB
     - Log success/failure

---

### 8.3 — Notifications Service — Payload Builder

- [ ] 8.3.1 Create `buildPayload(params)` — returns FCM `MulticastMessage` payload:
  - `notification.title`: senderName (direct) or groupName (group)
  - `notification.body`: preview text per message type
  - `data`: `{ conversationId, messageId, type: 'new_message' }`
  - `android`: `{ priority: 'high', notification: { channelId: 'messages' } }`
  - `apns`: `{ payload: { aps: { sound: 'default' } } }`
- [ ] 8.3.2 Create `buildPreview(content, messageType)` helper:
  - IMAGE → `📷 Photo`
  - FILE → `📎 File`
  - VOICE → `🎤 Voice message`
  - TEXT → `content.slice(0, 100)`
- [ ] 8.3.3 Create `removeInvalidToken(userId, token)` — `$pull` from `fcmTokens` array

---

### 8.4 — Notifications Module

- [ ] 8.4.1 Create `src/notifications/notifications.module.ts`
- [ ] 8.4.2 Import: `forwardRef(() => UsersModule)`, `forwardRef(() => ConversationsModule)`
- [ ] 8.4.3 Set up Redis client for deduplication (inject `ioredis` or use `RedisClientModule`)
- [ ] 8.4.4 Export `NotificationsService`

---

### 8.5 — Integration into Messages Module

- [ ] 8.5.1 Update `messages.module.ts`: add `forwardRef(() => NotificationsModule)` to imports
- [ ] 8.5.2 Inject `NotificationsService` into `MessagesService` constructor
- [ ] 8.5.3 Update `sendMessage()`: after saving message, get offline recipients and call `notificationsService.sendPushNotification(...)`
  - Get conversation to know: members, conversationType, groupName
  - Filter recipients: exclude sender, exclude online users, exclude users with `notificationsEnabled === false`
  - Call `notificationsService.sendPushNotification()` with filtered list

---

### 8.6 — Redis Deduplication Setup

- [ ] 8.6.1 Install `ioredis` (already in package.json ✅)
- [ ] 8.6.2 Create `src/common/redis/redis.module.ts` (singleton Redis client)
- [ ] 8.6.3 Export `RedisService` with `get(key)` / `setNXEX(key, value, seconds)` methods
- [ ] 8.6.4 Import `RedisModule` in `NotificationsModule`

---

### 8.7 — FCM Token Removal on Logout

- [ ] 8.7.1 Add `removeAllFcmTokens(userId)` to `UsersService` — `$set: { fcmTokens: [] }`
- [ ] 8.7.2 Update `AuthService.logout()`: inject `UsersService`, call `usersService.removeAllFcmTokens()` using userId from token payload
- [ ] 8.7.3 Update `auth.module.ts`: import `forwardRef(() => UsersModule)`

---

### 8.8 — TypeScript Check

- [ ] 8.8.1 Run `npx tsc --noEmit` — fix any type errors
- [ ] 8.8.2 Run `npm run lint -- --fix` — fix any lint errors

---

### 8.9 — Verification Checklist

- [ ] 8.9.1 Offline user → FCM notification sent ✅
- [ ] 8.9.2 Online user → no FCM sent (WS delivers real-time) ✅
- [ ] 8.9.3 `notificationsEnabled: false` → no FCM sent ✅
- [ ] 8.9.4 Multiple messages within 5s → only 1 FCM notification ✅
- [ ] 8.9.5 Multi-device → FCM sent to all tokens ✅
- [ ] 8.9.6 Invalid FCM token → removed from DB ✅
- [ ] 8.9.7 Direct text message → correct payload `{ title: senderName, body: content }` ✅
- [ ] 8.9.8 Group message → correct payload `{ title: groupName, body: "sender: preview" }` ✅
- [ ] 8.9.9 Image message → correct body `📷 Photo` ✅
- [ ] 8.9.10 Logout → all FCM tokens removed ✅
- [ ] 8.9.11 Firebase not configured → `ServiceUnavailableException`, app still starts ✅
