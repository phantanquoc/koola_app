# backend-gateway — Breakdown

## Fog Points & Resolutions

### Fog 1: Typing service — callback pattern hay event-driven?
**Resolution:** Keep callback pattern, wire existing callback to gateway.
**Rationale:** TypingService already has setTypingStopCallback(). Only need to wire it in gateway constructor.

### Fog 2: Typing debounce — client hay server?
**Resolution:** Client debounces 500ms, server auto-stops after 5s.
**Rationale:** Consistent with design.md recommendation.

### Fog 3: Dedup logic — service hay gateway?
**Resolution:** Put dedup in MessagesService (consistent with REST flow).
**Rationale:** Single source of truth for dedup logic.

### Fog 4: Presence broadcast — how to get shared conversations?
**Resolution:** Query UserConversation collection → broadcast to each room.
**Rationale:** Uses existing data model, no extra state needed.

## Architecture Decisions

- **Gateway:** Single `@WebSocketGateway({ namespace: '/chat' })` with all event handlers
- **Auth:** WsAuthGuard via CanActivate interface, WsException on failure
- **Typing:** Callback from TypingService → gateway broadcasts `user_typing`
- **Redis adapter:** Configured in `main.ts` via `createAdapter()`
- **Personal room:** `user:<userId>` for sender-only events
- **Conversation room:** `conversation:<conversationId>` for shared events

## Integration Points

```
ChatGateway
  ├── UsersService.updateOnlineStatus() → connect/disconnect
  ├── ConversationsService.findByIdOrFail() → join conversation
  ├── ConversationsService.getSharedConversationIds() → presence broadcast
  ├── MessagesService.sendMessage() → send_message event
  ├── MessagesService.markAsRead() → mark_read event
  ├── TypingService.startTyping/stopTyping → typing events
  └── TypingService.setTypingStopCallback() → auto-stop broadcast
```

## Files to Create

```
src/gateway/
  gateway.module.ts
  chat.gateway.ts
  guards/
    ws-auth.guard.ts
```

## Files to Modify

```
src/main.ts                          — Redis adapter setup
src/messages/typing.service.ts     — wire callback
src/conversations/conversations.service.ts — add getSharedConversationIds()
src/app.module.ts                   — import GatewayModule
```

## Dependencies

- `@socket.io/redis-adapter`: NOT in package.json → need to install
- `@nestjs/platform-socket.io`: already in package.json ✅
- `socket.io`: already in package.json ✅
