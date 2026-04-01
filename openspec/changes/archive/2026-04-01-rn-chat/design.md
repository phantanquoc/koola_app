# rn-chat — Design

## Architecture

```
ChatScreen (GiftedChat)
├── messages: IMessage[]           ← local state
├── onSend(text)                   ← REST POST + optimistic prepend
├── loadEarlier ()                 ← REST GET with cursor
├── renderBubble (props)           ← custom: sender=blue, receiver=gray
├── renderSend (props)             ← send button
├── renderActions (props)          ← attachment (placeholder)
├── renderSystemMessage (props)    ← gray centered text
├── renderMessageImage (props)     ← image thumbnail
├── renderTypingIndicator ()       ← "X is typing..." above input
└── GiftedChat props:
      renderInputToolbar          ← custom input
      renderComposer              ← TextInput
```

## Message Data Flow

```
1. Mount → GET /conversations/:id/messages?limit=20
   → messages (reversed for GiftedChat)
   → setMessages()

2. onSend(text) →
   a. Generate UUID clientMessageId
   b. Optimistic prepend: { _id: tempId, text, status: 'sending', ... }
   c. REST POST /conversations/:id/messages
   d. On ack → replace tempId with server _id, status → 'sent'

3. Socket new_message →
   a. If conversationId matches → prepend to messages
   b. Deduplicate by _id

4. Last message visible → debounce 500ms → emit mark_read via WS
   → Socket message_read → update status to 'read'

5. Long press message → confirm → REST DELETE
   → optimistic remove from list
```

## GiftedChat IMessage Format

```typescript
interface GiftedMessage {
  _id: string | number;
  text: string;
  createdAt: Date;
  user: { _id: string; name?: string; avatar?: string };
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  image?: string;       // mediaUrl for image messages
  mediaUrl?: string;
  mediaMimeType?: string;
  type: 'text' | 'image' | 'file' | 'system';
  clientMessageId?: string;  // for dedup during optimistic send
}
```

## Socket Events

| Event | Handler |
|-------|---------|
| `new_message` | If convId matches → prepend to messages |
| `message_ack` | Replace tempId → server _id, status → 'sent' |
| `message_read` | Update message status to 'read' |
| `user_typing` | Update typing state `{ [userId]: true }` |
| `message_deleted` | Remove from messages list |

## Hooks

### `useMessages(conversationId, currentUserId)`
- `messages: GiftedMessage[]`
- `sendMessage(text)` — optimistic + REST
- `loadEarlier()` — cursor pagination
- `deleteMessage(_id)` — REST DELETE + optimistic remove
- `replaceMessage(tempId, serverMessage)` — update after ack

### `useTypingIndicator()`
- `typingUsers: string[]` — userIds currently typing
- `emitTyping(text)` — debounced 500ms, only if text non-empty

### `useReadReceipts(messages, lastVisibleMessageId)`
- `markRead(messageId)` — emit mark_read via WS, debounced 500ms
- Tracks `lastReadMessageId` to avoid duplicate emits

## Offline Queue Integration

```typescript
// In sendMessage:
if (!isConnected) {
  queueMessage({ conversationId, content, type: 'text', clientMessageId });
  return;
}
```

Full queue persistence and retry handled by `OfflineQueueContext` (rn-offline module).
