## Architecture

### Overview

```
Message Sent
     │
     ▼
MessagesService.sendMessage()
     │
     ├── Save message to MongoDB
     ├── Update conversation.lastMessageAt
     ├── Increment unreadCount for recipients
     │
     ▼
NotificationsService.sendPushNotification(recipients, message)
     │
     ├── Filter: skip if sender = recipient (no self-notification)
     ├── For each recipient:
     │     ├── Check notificationsEnabled → skip if false
     │     ├── Check isOnline → skip if online (WS delivers real-time)
     │     ├── Check Redis dedup key (5s TTL) → skip if recent notif
     │     ├── Build FCM payload by message type + conv type
     │     ├── Send FCM to all user tokens
     │     └── Remove invalid tokens on error
```

### File Structure

```
src/
  notifications/
    notifications.module.ts     — imports: forwardRef(() => UsersModule), RedisModule
    notifications.service.ts    — FCM sending, dedup, payload building
    fcm-client.ts               — lazy Firebase Admin initialization
  messages/
    messages.module.ts          — imports: forwardRef(() => NotificationsModule)
    messages.service.ts         — calls notificationsService.sendPushNotification()
  auth/
    auth.service.ts             — logout() clears FCM tokens
```

### FCM Client — Lazy Initialization

```typescript
// fcm-client.ts
let firebaseApp: admin.app.App | null = null;

export function getFirebaseApp(): admin.app.App {
  if (!firebaseApp) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
  }
  return firebaseApp;
}
```

### Redis Deduplication Key

- **Key pattern:** `notif:{userId}:{conversationId}`
- **TTL:** 5 seconds
- **Value:** ISO timestamp
- **Logic:** `SET key timestamp EX 5 NX` → if SET returns null (key exists), skip FCM

### Payload Builder

| Scenario | `notification.title` | `notification.body` | `data` |
|---|---|---|---|
| Direct, text | `<senderName>` | `<messageContent truncated to 100 chars>` | `{conversationId, messageId, type: 'new_message'}` |
| Direct, image | `<senderName>` | `📷 Photo` | `{conversationId, messageId, type: 'new_message'}` |
| Direct, file | `<senderName>` | `📎 File` | `{conversationId, messageId, type: 'new_message'}` |
| Group, text | `<groupName>` | `<senderName>: <messagePreview>` | `{conversationId, messageId, type: 'new_message'}` |
| Group, image | `<groupName>` | `<senderName>: 📷 Photo` | `{conversationId, messageId, type: 'new_message'}` |

### FCM Error Handling

| FCM Error Code | Action |
|---|---|
| `UNREGISTERED` | Remove token from user's `fcmTokens` array |
| `INVALID_ARGUMENT` | Remove malformed token |
| `QUOTA_EXCEEDED` | Log warning, skip (FCM handles retry) |
| `UNAVAILABLE` | Log warning, skip (FCM handles retry) |
| Other | Log error, continue to next token |

### Message Preview Construction

```
function buildPreview(content: string, type: MessageType): string {
  switch (type) {
    case IMAGE:  return '📷 Photo';
    case FILE:   return '📎 File';
    case VOICE:  return '🎤 Voice message';
    default:     return content.slice(0, 100);
  }
}
```

### Notification Trigger Flow

```
sendMessage() in MessagesService:
  1. Save message
  2. Get conversation members (from ConversationsService)
  3. Filter out: sender, online users, users with notificationsDisabled
  4. For remaining offline users:
       → NotificationsService.sendPushNotification(recipientIds, message)
```

### Integration Points

1. **MessagesService → NotificationsService**:
   - `messages.module.ts` imports `forwardRef(() => NotificationsModule)`
   - Constructor injection of `NotificationsService`
   - Called after `message.save()` with all relevant data

2. **AuthService → UsersService**:
   - `logout()` calls `usersService.removeAllFcmTokens(userId)` (add method)
   - Ensures FCM tokens are cleared on logout

3. **Redis deduplication**:
   - Uses existing `ioredis` connection from `@nestjs/config` or a dedicated Redis client
   - Key: `notif:{recipientId}:{conversationId}`, TTL: 5 seconds
