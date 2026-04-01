# backend-notifications — Breakdown

## Fog Points & Resolutions

### Fog 1: Nơi đặt logic FCM
**Question:** Trong MessagesService hay NotificationsModule riêng?
**Resolution:** NotificationsModule riêng với NotificationsService.
**Rationale:** Separation of concerns, testable, keep MessagesService clean.

### Fog 2: Per-conversation notification settings
**Question:** Spec yêu cầu per-conversation settings?
**Resolution:** Global `notificationsEnabled` flag là đủ MVP. Per-conversation → Phase 2.
**Rationale:** Scope control. Global flag cover được use case chính.

### Fog 3: Notification deduplication
**Question:** Redis hay in-memory?
**Resolution:** Redis-based deduplication (SETNX + 5s TTL).
**Rationale:** Redis đã có sẵn (VM4), RedisAdapter đã được mention trong design. Production-ready.

### Fog 4: FCM initialization
**Question:** Eager hay lazy init?
**Resolution:** Lazy init — check env vars, throw ServiceUnavailableException nếu Firebase chưa config.
**Rationale:** Fail gracefully. App still runs if Firebase not configured yet.

## Architecture Decisions

- **Firebase Admin:** Lazy singleton via `getFirebaseApp()` in `fcm-client.ts`
- **Redis deduplication:** Key `notif:{recipientId}:{conversationId}`, TTL 5s
- **NotificationsService:** Độc lập, inject được vào MessagesService
- **Logout cleanup:** AuthService.logout() gọi usersService.removeAllFcmTokens()

## Integration Points

```
MessagesService.sendMessage()
  └── NotificationsService.sendPushNotification()
        ├── UsersService.getPresence(userId) → check isOnline
        ├── UsersService.findById() → check notificationsEnabled + fcmTokens
        ├── ConversationsService.findByIdOrFail() → get conv info
        ├── Redis dedup check
        └── fcm-client.ts → sendMulticast()

AuthService.logout()
  └── UsersService.removeAllFcmTokens()
```

## Schema Changes

User schema đã có đủ — KHÔNG cần thay đổi:
- ✅ `fcmTokens: [{ token, platform, createdAt }]`
- ✅ `settings: { notificationsEnabled }`

## Edge Cases

| Edge Case | Handling |
|---|---|
| User offline → FCM sent | Check isOnline === false |
| Online user | Skip — WebSocket delivers real-time |
| `notificationsEnabled: false` | Skip |
| Multiple messages in 5s | Redis dedup → only 1 FCM |
| Multi-device | Send to ALL tokens |
| Invalid token | Remove from DB, continue |
| Firebase not configured | ServiceUnavailableException |
| No FCM tokens | Skip silently (log warning) |

## Files to Create

```
src/notifications/
  notifications.module.ts
  notifications.service.ts
  fcm-client.ts
src/common/redis/
  redis.module.ts
  redis.service.ts
```

## Env Additions

Không có env mới — Firebase credentials đã có trong `.env`.

## Dependencies

- `firebase-admin`: already in package.json ✅
- `ioredis`: already in package.json ✅
