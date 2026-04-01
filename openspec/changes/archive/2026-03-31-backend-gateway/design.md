## Architecture

### Gateway Structure

```
@WebSocketGateway({ namespace: '/chat', cors: true })
ChatGateway
  ├── @UseGuards(WsAuthGuard) on all event handlers
  │
  ├── @SubscribeMessage('ping')
  │     → emit('pong'), update lastSeen
  │
  ├── @SubscribeMessage('join_conversation')
  │     → verify membership → join room → emit('joined')
  │
  ├── @SubscribeMessage('leave_conversation')
  │     → leave room
  │
  ├── @SubscribeMessage('send_message')
  │     → MessagesService.sendMessage() → emit('message_ack') to sender
  │     → io.to('conversation:X').except(socket) → emit('new_message')
  │
  ├── @SubscribeMessage('typing_start')
  │     → TypingService.startTyping() → io.to('conversation:X').emit('user_typing')
  │
  ├── @SubscribeMessage('typing_stop')
  │     → TypingService.stopTyping() → io.to('conversation:X').emit('user_typing')
  │
  ├── @SubscribeMessage('mark_read')
  │     → MessagesService.markAsRead() → io.to('user:SENDER').emit('message_read')
  │
  └── @SubscribeMessage('presence_update')
        → UsersService.updateOnlineStatus() → broadcast to all shared conv rooms
```

### Room Architecture

| Room | Purpose | Who joins |
|---|---|---|
| `user:<userId>` | Personal events | Own socket only |
| `conversation:<conversationId>` | Conversation events | Members of conversation |

### Heartbeat

- Client sends `ping` every 15 seconds
- Server responds `pong` + updates `lastSeen`
- If no `ping` received for 30 seconds → disconnect → mark offline → broadcast `presence_update`

### Typing Flow

```
Client types → waits 500ms (client debounce) → emits 'typing_start'
Server receives → TypingService.startTyping() → sets 5s timer
  → io.to('conversation:X').emit('user_typing', { userId, isTyping: true })

Timer fires OR client sends 'typing_stop'
  → TypingService.stopTyping() → callback → emit 'user_typing' { isTyping: false }
```

### Message Send Flow (WebSocket)

```
Client emits 'send_message' { conversationId, content, type, clientMessageId? }
  → Verify member
  → Check clientMessageId dedup (5 min window) → if dup: emit('message_ack', existing) → return
  → MessagesService.sendMessage()
  → emit('message_ack', fullMessage) to sender's socket
  → io.to('conversation:X').except(senderSocket).emit('new_message', { message })
  → triggerPushNotifications() for offline recipients
```

### Presence Broadcast on Connect/Disconnect

```
On connect:
  → UsersService.updateOnlineStatus(userId, true)
  → Query all conversations user is member of
  → For each conversation: io.to('conversation:X').emit('presence_update', { userId, isOnline: true })

On disconnect (after 30s no heartbeat):
  → UsersService.updateOnlineStatus(userId, false)
  → Same broadcast to all shared conversations
```

### Redis Adapter Setup

```typescript
// main.ts or gateway setup
import { createAdapter } from '@socket.io/redis-adapter';
const pubClient = new Redis(process.env.REDIS_URL);
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

### Server-to-Client Event Payloads

| Event | Payload |
|---|---|
| `pong` | `{}` |
| `joined` | `{ conversationId }` |
| `error` | `{ code: number, message: string }` |
| `message_ack` | `{ messageId, status, ...fullMessage }` |
| `new_message` | `{ message }` |
| `message_delivered` | `{ messageId }` |
| `message_read` | `{ messageId, readBy }` |
| `message_deleted` | `{ messageId, conversationId }` |
| `user_typing` | `{ conversationId, userId, isTyping: boolean }` |
| `presence_update` | `{ userId, isOnline: boolean, lastSeen: string }` |
| `conversation_updated` | `{ conversation }` |
| `conversation_created` | `{ conversation }` |

### Error Codes

| Code | Meaning |
|---|---|
| 4001 | Authentication failed |
| 403 | Not authorized (not a member) |
| 404 | Resource not found (conversation, message) |
| 400 | Bad request (validation error) |
