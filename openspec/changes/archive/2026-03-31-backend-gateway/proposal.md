## Why

The real-time layer is what makes this a chat app rather than an email system. Users need instant delivery of messages, typing indicators, read receipts, and online/offline presence — all without polling. WebSocket via Socket.io provides bidirectional, low-latency communication. Using Redis as the Socket.io adapter from day one means horizontal scaling is a configuration change, not a code rewrite, when the app grows.

## What Changes

This change adds the `real-time-gateway` capability to the NestJS backend:

- **`@WebSocketGateway({ namespace: '/chat' })`**: Single gateway handling all real-time events on the `/chat` namespace.
- **WebSocket authentication**: JWT token passed as query param `?token=<access_token>`. Invalid/expired tokens close the connection with code 4001.
- **Presence management**: Mark online on connect, offline on disconnect (30s heartbeat timeout). Broadcast `presence_update` to all shared conversations.
- **Room management**: `join_conversation` / `leave_conversation` events. Users join `conversation:<conversationId>` rooms to receive message events.
- **Message sending via WebSocket**: `send_message` event saves via `MessagesService`, returns `message_ack` to sender, broadcasts `new_message` to conversation room.
- **Typing indicators**: `typing_start` / `typing_stop` events, 5-second server-side auto-timeout via `TypingService`.
- **Read receipts**: `mark_read` event updates status, emits `message_read` to sender's personal room `user:<senderId>`.
- **Redis Socket.io adapter**: Broadcasts events across multiple NestJS instances via Redis pub/sub.

## Capabilities

### New Capabilities

- `real-time-gateway`: NestJS WebSocket gateway on `/chat` namespace. Handles all client→server and server→client real-time events.

### Modified Capabilities

- `messaging` (existing): `MessagesService` already exists and handles message persistence. Gateway calls `MessagesService.sendMessage()` for `send_message` events.
- `typing` (existing): `TypingService` already exists. Gateway wires the typing stop callback to emit `user_typing` events.
- `notifications` (existing): Gateway triggering push notifications already handled in REST flow. Gateway complements by providing real-time delivery for online users.
- `presence` (existing): `UsersService.updateOnlineStatus()` already exists. Gateway calls it on connect/disconnect.

## Impact

### Backend (NestJS)
- New `gateway` module: `ChatGateway`, `WsAuthGuard`, Redis adapter configuration
- `TypingService`: wire callback to gateway (minor change)
- Redis: configure `@nestjs/platform-socket.io` with Redis adapter

### External Dependencies
- Redis: already provisioned on VM4, already in use by NotificationsService
