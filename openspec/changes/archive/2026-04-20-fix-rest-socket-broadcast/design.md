---
name: fix-rest-socket-broadcast
---

# Design: REST/Socket Broadcast Fix

## Dependency

GatewayModule already imports MessagesModule. Now MessagesModule needs GatewayModule too.
Use forwardRef both ways to break circular dependency.

## Broadcast Strategy

Broadcast to entire room `conversation:{conversationId}`.
Frontend already handles dedup:

- useMessages.ts:77 — skips own messages: `if (msg.senderId === currentUserId) return`
- useMessages.ts:80 — dedup by _id: `if (prev.find(m => m._id === msg._id)) return prev`

## Event Payloads (matching existing ChatGateway patterns)

**new_message** (send + forward):
```
io.to(`conversation:${conversationId}`).emit('new_message', { message: doc.toObject() })
```

**message_deleted**:
```
io.to(`conversation:${conversationId}`).emit('message_deleted', { messageId, conversationId })
```

**message_reaction**:
```
io.to(`conversation:${conversationId}`).emit('message_reaction', { messageId, conversationId, userId, emoji, action })
```

## Files Changed

1. `chat-backend/src/messages/messages.module.ts` — add GatewayModule import (forwardRef)
2. `chat-backend/src/messages/messages.controller.ts` — inject ChatGateway, broadcast after send/delete/react
3. `chat-backend/src/messages/messages-sync.controller.ts` — inject ChatGateway, broadcast after forward
