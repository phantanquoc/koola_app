# rn-chat — Tasks

## Hooks

- [x] 1.1 `useMessages(conversationId, currentUserId)` — all state, fetch, send, delete, socket listeners
- [x] 1.2 `useTypingIndicator(conversationId)` — typing state, emit, auto-remove timeout
- [x] 1.3 `useReadReceipts(conversationId, messages)` — markRead debounced

## ChatScreen

- [x] 2.1 `GiftedChat` wrapper with all required props
- [x] 2.2 `renderBubble` — sender=blue, receiver=gray
- [x] 2.3 `renderSend` — custom blue send button
- [x] 2.4 `renderLoadEarlier` — "Load more" button
- [x] 2.5 `renderSystemMessage` — gray centered italic
- [x] 2.6 `onSend` — call `sendMessage()` hook
- [x] 2.7 `onInputTextChanged` — call `emitTyping()`
- [x] 2.8 `onLoadEarlier` — call `loadEarlier()` hook
- [x] 2.9 Socket: `join_conversation` on mount, `leave_conversation` on unmount
- [x] 2.10 Socket: `new_message`, `message_ack`, `message_deleted` handlers
- [x] 2.11 `onLongPress` — placeholder for delete confirmation

## Dependencies

- [x] 3.1 `react-native-gifted-chat@2` — compatible with RN 0.76
- [x] 3.2 `react-native-gesture-handler` — peer dep
- [x] 3.3 `react-native-reanimated` — peer dep

## Verification

- [x] 4.1 `npx tsc --noEmit` passes ✅
- [x] 4.2 GiftedChat renders messages correctly
- [x] 4.3 Send: optimistic → REST → ack → status update
- [x] 4.4 Receive: socket new_message → prepend to list
- [x] 4.5 Pagination: loadEarlier appends messages correctly
