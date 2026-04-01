## backend-gateway — Implementation Tasks

---

### 9.1 — WebSocket Auth Guard

- [ ] 9.1.1 Create `src/gateway/guards/ws-auth.guard.ts`: implement `CanActivate`
  - Extract `token` from `WsParam('handshake.query.token')`
  - Verify JWT using `JwtService.verify(token, { secret })`
  - If invalid → throw `WsException({ code: 4001, message: 'Authentication failed' })`
  - Attach `user` to socket data: `socket.data.user = user`
- [ ] 9.1.2 Export `WsAuthGuard` from `gateway.module.ts`

---

### 9.2 — Chat Gateway — Connection Lifecycle

- [ ] 9.2.1 Create `src/gateway/chat.gateway.ts`
- [ ] 9.2.2 `@WebSocketGateway({ namespace: '/chat', cors: true })`
- [ ] 9.2.3 `@WebSocketServer() io: Server` — to access Socket.io server instance
- [ ] 9.2.4 Inject: `UsersService`, `ConversationsService`, `MessagesService`, `TypingService`
- [ ] 9.2.5 `afterInit()`: log gateway initialized
- [ ] 9.2.6 `handleConnection(client: Socket)`:
  - `WsAuthGuard` already validated token and attached `client.data.user`
  - Get `userId` from `client.data.user.sub`
  - Call `UsersService.updateOnlineStatus(userId, true)`
  - Join personal room: `client.join(`user:${userId}`)`
  - Broadcast `presence_update` to all shared conversations
  - Start heartbeat timeout (30s)
- [ ] 9.2.7 `handleDisconnect(client: Socket)`:
  - Get `userId` from `client.data.user`
  - Call `UsersService.updateOnlineStatus(userId, false)`
  - Broadcast `presence_update` to all shared conversations

---

### 9.3 — Heartbeat

- [ ] 9.3.1 `@SubscribeMessage('ping')`: update `lastSeen` in DB, emit `pong` to sender, reset heartbeat timeout
- [ ] 9.3.2 Heartbeat timeout: 30s `setTimeout` per socket. On timeout → call `handleDisconnect()` manually, then `client.disconnect(true)`
- [ ] 9.3.3 Store heartbeat timeout handle on socket: `client.data.heartbeatTimer`

---

### 9.4 — Join / Leave Conversation

- [ ] 9.4.1 `@SubscribeMessage('join_conversation')` with `@UseGuards(WsAuthGuard)`
  - Extract `conversationId` from payload
  - Verify membership via `ConversationsService.findByIdOrFail()` + member check
  - If not member → emit `error` `{ code: 403, message: 'Not a member of this conversation' }`
  - Join room: `client.join(`conversation:${conversationId}`)`
  - Emit `joined` `{ conversationId }` to sender
- [ ] 9.4.2 `@SubscribeMessage('leave_conversation')`
  - Extract `conversationId`
  - `client.leave(`conversation:${conversationId}`)`

---

### 9.5 — Send Message via WebSocket

- [ ] 9.5.1 `@SubscribeMessage('send_message')` with `@UseGuards(WsAuthGuard)`
  - Payload: `{ conversationId, content?, type?, clientMessageId? }`
  - Validate `conversationId` exists and user is member
  - **Dedup check** (5 min window): query `Message.findOne({ conversationId, clientMessageId, createdAt: { $gt: 5_min_ago } })`. If found → emit `message_ack` with existing message → return
  - Call `MessagesService.sendMessage()`
  - Emit `message_ack` to sender's socket with full message object
  - Broadcast `new_message` to room: `this.io.to(`conversation:${conversationId}`).except(client).emit('new_message', { message })`
  - Trigger push notifications (fire-and-forget): call `MessagesService.triggerPushNotifications(...)`

---

### 9.6 — Typing Events

- [ ] 9.6.1 `@SubscribeMessage('typing_start')` with `@UseGuards(WsAuthGuard)`
  - Payload: `{ conversationId }`
  - Call `TypingService.startTyping(conversationId, userId)`
  - Broadcast: `this.io.to(`conversation:${conversationId}`).emit('user_typing', { conversationId, userId, isTyping: true })`
- [ ] 9.6.2 `@SubscribeMessage('typing_stop')` with `@UseGuards(WsAuthGuard)`
  - Payload: `{ conversationId }`
  - Call `TypingService.stopTyping(conversationId, userId)`
  - Broadcast: `this.io.to(`conversation:${conversationId}`).emit('user_typing', { conversationId, userId, isTyping: false })`
- [ ] 9.6.3 Wire `TypingService.setTypingStopCallback()` in gateway constructor:
  - Callback: broadcast `user_typing` with `isTyping: false` to conversation room

---

### 9.7 — Mark Read

- [ ] 9.7.1 `@SubscribeMessage('mark_read')` with `@UseGuards(WsAuthGuard)`
  - Payload: `{ conversationId, messageId }`
  - Call `MessagesService.markAsRead(messageId, userId)`
  - Emit to sender's personal room: `this.io.to(`user:${senderId}`).emit('message_read', { messageId, readBy: userId })`
  - **Note**: need senderId — get from message in DB before marking read, or include in payload

---

### 9.8 — Presence Update

- [ ] 9.8.1 `@SubscribeMessage('presence_update')` with `@UseGuards(WsAuthGuard)`
  - Payload: `{ status: 'online' | 'away' }`
  - Update in DB via `UsersService.updateOnlineStatus()`
  - Get all shared conversations for user via `ConversationsService.getSharedConversations(userId)` — add helper if not exists
  - Broadcast `presence_update` to each conversation room

---

### 9.9 — Gateway Module + Redis Adapter

- [ ] 9.9.1 Create `src/gateway/gateway.module.ts`: import `UsersModule`, `ConversationsModule`, `MessagesModule`, forwardRef to `NotificationsModule`
- [ ] 9.9.2 In `main.ts`: configure Redis adapter for Socket.io:
  ```typescript
  import { createAdapter } from '@socket.io/redis-adapter';
  const pubClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));
  ```
- [ ] 9.9.3 Add `GatewayModule` to `AppModule` imports

---

### 9.10 — ConversationsService Helper

- [ ] 9.10.1 Add `getSharedConversationIds(userId: string): Promise<string[]>` to `ConversationsService`
  - Query: `UserConversation.find({ userId })` → return `conversationId[]`
- [ ] 9.10.2 For presence broadcast on connect/disconnect, use this helper

---

### 9.11 — TypeScript Check

- [ ] 9.11.1 Run `npx tsc --noEmit` — fix any type errors
- [ ] 9.11.2 Run `npm run lint -- --fix` — fix any lint errors

---

### 9.12 — Verification Checklist

- [ ] 9.12.1 WS connection with valid token → authenticated, joins personal room, marked online ✅
- [ ] 9.12.2 WS connection with invalid token → connection closed with code 4001 ✅
- [ ] 9.12.3 `ping` → `pong` emitted, lastSeen updated ✅
- [ ] 9.12.4 No ping for 30s → disconnected, offline, presence_update broadcast ✅
- [ ] 9.12.5 `join_conversation` with valid membership → joined room, ack sent ✅
- [ ] 9.12.6 `join_conversation` non-member → error 403 emitted ✅
- [ ] 9.12.7 `send_message` via WS → message_ack to sender, new_message to room ✅
- [ ] 9.12.8 Duplicate clientMessageId (5 min) → returns existing, no duplicate ✅
- [ ] 9.12.9 `typing_start` → user_typing broadcast to room ✅
- [ ] 9.12.10 5s auto-stop → user_typing isTyping:false broadcast ✅
- [ ] 9.12.11 `mark_read` → message_read emitted to sender's personal room ✅
- [ ] 9.12.12 `presence_update` → broadcast to all shared conversations ✅
- [ ] 9.12.13 Redis adapter → message from server 1 reaches client on server 2 ✅
