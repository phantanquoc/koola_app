## 1. Backend: Schema updates

- [x] 1.1 Add `reactions: [{ userId: String, emoji: String }]` field to Message schema (message.schema.ts)
- [x] 1.2 Add `deletedFor: [String]` field to Message schema (default: [])
- [x] 1.3 Add `pinnedMessages: [{ messageId: String, pinnedBy: String, pinnedAt: Date }]` field to Conversation schema
- [x] 1.4 Update Message TypeScript types in frontend `types/index.ts` to include reactions and deletedFor ← (verify: schema fields match between backend and frontend types)

## 2. Backend: Reactions API + Socket

- [x] 2.1 Add `PUT /conversations/:convId/messages/:msgId/react` endpoint — body: `{ emoji }`, toggle logic (add/remove/replace)
- [x] 2.2 Add `message_reaction` socket event in chat.gateway.ts — broadcast `{ messageId, conversationId, userId, emoji, action }` to conversation room
- [x] 2.3 Filter messages where `deletedFor` includes requesting userId in `listMessages` and `syncMessages` ← (verify: reactions toggle correctly, socket event broadcasts, deletedFor filtering works)

## 3. Backend: Delete for me

- [x] 3.1 Add `PUT /conversations/:convId/messages/:msgId/delete-for-me` endpoint — push userId to deletedFor array
- [x] 3.2 Update existing `deleteMessage` to be "delete for everyone" path — keep 24h + sender-only rules ← (verify: delete-for-me adds to array, delete-for-everyone still works with 24h limit)

## 4. Backend: Forward message

- [x] 4.1 Add `POST /messages/forward` endpoint — body: `{ messageId, targetConversationIds[] }`, max 10 targets
- [x] 4.2 Forward creates new message in each target with "[Chuyển tiếp]" prefix, copies mediaUrl/type/size
- [x] 4.3 Verify sender is member of all target conversations ← (verify: forward creates messages in all targets, membership checked, limit enforced)

## 5. Backend: Pin message

- [x] 5.1 Add `PUT /conversations/:convId/pin/:msgId` — via socket `pin_message` handler in chat.gateway.ts
- [x] 5.2 Add `DELETE /conversations/:convId/pin/:msgId` — via socket `unpin_message` handler in chat.gateway.ts
- [x] 5.3 Add `message_pinned` and `message_unpinned` socket events in chat.gateway.ts
- [x] 5.4 Include pinnedMessages in conversation details API response — included via conv.toObject() in getConversationDetails

## 6. Frontend: Context menu (MessageContextMenu)

- [x] 6.1 Create `MessageContextMenu` component — Modal bottom sheet with emoji row + action buttons (Forward, Pin/Unpin, Copy, Delete)
- [x] 6.2 Wire GiftedChat `onLongPress` to open MessageContextMenu with the selected message
- [x] 6.3 "Sao chép" action — copy message text to clipboard, Toast "Đã sao chép"
- [x] 6.4 "Xóa" action — show sub-options: "Xóa cho tôi" (always) + "Xóa cho mọi người" (sender only, within 24h) ← (verify: context menu shows all actions, copy works, delete shows correct options based on sender/time)

## 7. Frontend: Reactions display + toggle

- [x] 7.1 Create `ReactionDisplay` component — shows emoji row with counts under message bubble
- [x] 7.2 Wire emoji tap in context menu → call react API → update local state optimistically
- [x] 7.3 Handle `message_reaction` socket event — update reactions in message list
- [x] 7.4 Integrate ReactionDisplay into GiftedChat renderBubble or renderCustomView ← (verify: reactions show under bubble, toggle works, real-time sync via socket)

## 8. Frontend: Delete for me

- [x] 8.1 Wire "Xóa cho tôi" → call delete-for-me API → remove message from local state
- [x] 8.2 Filter messages by `deletedFor` in useMessages hook (both initial load and socket updates)
- [x] 8.3 Wire "Xóa cho mọi người" → existing deleteMessage flow, show Alert if >24h ← (verify: delete-for-me hides message locally, delete-for-everyone shows placeholder, 24h error Alert)

## 9. Frontend: Forward modal

- [x] 9.1 Create `ForwardModal` component — conversation list with checkboxes, search bar, send button
- [x] 9.2 Wire "Chuyển tiếp" in context menu → open ForwardModal with selected message
- [x] 9.3 On confirm → call forward API → Toast "Đã chuyển tiếp", close modal
- [x] 9.4 Enforce max 10 selection with Toast warning ← (verify: forward modal shows conversations, search works, multi-select works, forward creates messages in targets)

## 10. Frontend: Pin banner

- [x] 10.1 Create `PinBanner` component — shows "📌 {truncated content}", tap to scroll, cycle through multiple pins
- [x] 10.2 Wire "Ghim"/"Bỏ ghim" in context menu → call pin/unpin API
- [x] 10.3 Handle `message_pinned`/`message_unpinned` socket events → update pin state
- [x] 10.4 Integrate PinBanner above GiftedChat in ChatScreen ← (verify: pin banner shows, tap scrolls to pinned message, cycling works, real-time pin/unpin updates)

## 11. Frontend: Direct file download

- [x] 11.1 Update FileAttachment download handler — use react-native-blob-util to download to Downloads folder
- [x] 11.2 Android: use MediaCollection.copyToMediaStore for file manager visibility
- [x] 11.3 Toast "Đã tải về" on success, Alert on failure ← (verify: file saves to Downloads, visible in file manager, Toast shown)
