## 1. P0 Bug Fixes — Mobile

- [x] 1.1 In `ChatApp/src/screens/chat/hooks/useMessages.ts`, in the `loadEarlier` path (around line 236), apply the same `deletedFor.includes(currentUserId)` filter used on initial fetch before merging older messages into state
- [x] 1.2 In `useMessages.ts` `deleteMessage` (around line 387), wrap the REST call in try/catch; on error, restore the removed message at its original index and invoke an error callback (toast)
- [x] 1.3 In `useMessages.ts` `deleteForMe` (around line 427), same rollback pattern as 1.2
- [x] 1.4 Remove the `onSend` prop from the GiftedChat element in `ChatApp/src/screens/chat/ChatScreen.tsx` (lines ~260-276); verify no keyboard-submit or other implicit path relies on it; unify on `handleSend`
- [x] 1.5 Wrap `handlePin` and `handleUnpin` (ChatScreen.tsx ~221-227) in try/catch; show a toast on failure with the localized error messages defined in `pin-message` spec
- [x] 1.6 In `useMessages.ts` `toGiftedMessage`, map `msg.mediaThumbnailKey` onto the returned IMessage so `renderMessageVideo` receives a non-undefined thumbnail key ← (verify: send a video message, confirm thumbnail renders without blurhash fallback on both sender and receiver)

## 2. P1 UX Gap Closures — Mobile

- [x] 2.1 Add toast infrastructure if not already present (`react-native-toast-message` is a dep; verify `Toast` root is mounted in App root)
- [x] 2.2 In `useMessages.ts`, add a `message_read` socket listener that updates the matching message's local `readBy` array (dedup with Set semantics) and triggers a re-render
- [x] 2.3 Extend the IMessage mapping in `toGiftedMessage` to include `readBy: string[]` and `status: 'pending' | 'sent' | 'read' | 'failed'` derived from `pending`, `sent`, and `readBy`
- [x] 2.4 In `renderBubble` (or a new `MessageTicks` sub-component) render clock/check/double-check/red-exclamation icons based on derived status; double-check rule per `chat-read-receipts` spec (1-1: any other reader; group: all others)
- [x] 2.5 Wire the failed-state icon to a retry handler: generate a new `clientMessageId`, clear failed flag, re-invoke send path (online → REST, offline → queue)
- [x] 2.6 In `ChatScreen.tsx`, if `conversation.type === 'direct'`, subscribe to `presence_update` filtered by the other participant's userId; store `isOnline` and `lastSeen` in local state
- [x] 2.7 Render the presence indicator in the header: green dot on avatar when online, subtitle "Đang hoạt động" / "Hoạt động X phút trước" / empty per `chat-presence` spec
- [x] 2.8 Convert `visibleMessageIds` from `useState` to `useRef<Set<string>>`; update the `onViewableItemsChanged` handler to mutate the ref; notify `VideoMessage` children imperatively (callback prop or per-message Animated.Value) — goal: zero `setState` on scroll ← (verify: scroll a list of 200+ messages rapidly; React DevTools shows no ChatScreen re-render per scroll tick)
- [x] 2.9 Consolidate conversation fetch: remove redundant `getDetails` calls in `handleHeaderPress` and `handleStartCall`; both handlers reuse the existing `conversation` state; if `conversation` is null (first-call race), fall back to one fetch
- [x] 2.10 In the offline-queue path (`sendViaQueue`), insert an optimistic message with `pending: true` into local state identical to the online optimistic path; pass `clientMessageId` through
- [x] 2.11 Extend `OfflineQueueService` with `processed(clientMessageId, serverMessage)` and `failed(clientMessageId)` events (observer pattern); ChatScreen subscribes and updates its message list accordingly
- [x] 2.12 Hoist the inline `{paddingTop: 20}` object in `listViewProps.contentContainerStyle` (ChatScreen.tsx ~834) to a module-level `StyleSheet.create` constant ← (verify: send a message and watch FlatList; no flicker introduced; existing padding preserved)

## 3. Reply Feature — Backend

- [x] 3.1 In `chat-backend/src/messages/schemas/message.schema.ts`, add optional `replyTo?: Types.ObjectId` with `ref: 'Message'` and optional `replyToPreview?: { senderId: Types.ObjectId; text?: string; mediaType?: MessageType }` as an embedded schema
- [x] 3.2 In `chat-backend/src/messages/dto/send-message.dto.ts`, add optional `replyTo?: string` with `@IsMongoId()` + `@IsOptional()` decorators
- [x] 3.3 In `chat-backend/src/messages/messages.service.ts` `create` (or equivalent send path), if `dto.replyTo` is present:
  - a. Fetch source message by id
  - b. If not found → throw `BadRequestException` with code `REPLY_SOURCE_NOT_FOUND`
  - c. If `source.conversationId !== dto.conversationId` → `REPLY_CROSS_CONVERSATION`
  - d. If `source.deletedAt` is truthy → `REPLY_SOURCE_DELETED`
  - e. If `source.deletedFor?.includes(callerUserId)` → `REPLY_SOURCE_DELETED_FOR_USER`
  - f. Build `replyToPreview`: `{ senderId: source.senderId, text: source.content?.slice(0, 100) || undefined, mediaType: source.type !== 'text' ? source.type : undefined }`
  - g. Persist `replyTo` + `replyToPreview` on the new message
- [x] 3.4 Verify list/sync/single-fetch responses include `replyTo` and `replyToPreview` fields (Mongoose `toObject()` default behavior — confirm no projection excludes them)
- [x] 3.5 Verify `ChatGateway` broadcast of `new_message` includes the new fields (no projection; should be automatic via `toObject`)
- [x] 3.6 Add unit test: `messages.service.spec.ts` covers the 5 validation branches (not-found, cross-conversation, deleted-for-everyone, deleted-for-user, valid happy path — preview shape correct for text vs media source)
- [ ] 3.7 Add e2e test (or extend existing messages e2e): POST a reply, GET the conversation, confirm `replyTo` + `replyToPreview` round-trip correctly ← (verify: backend test suite passes; reply fields present in both REST response and socket broadcast)

## 4. Reply Feature — Mobile

- [x] 4.1 In `ChatApp/src/types/message.ts`, add optional `replyTo?: string` and `replyToPreview?: { senderId: string; text?: string; mediaType?: MessageType }` to the `Message` interface
- [x] 4.2 In `ChatApp/src/services/apiService.ts`, update `messagesApi.sendMessage` body type to accept optional `replyTo?: string`
- [x] 4.3 In `useMessages.ts` `toGiftedMessage`, carry `replyTo` + `replyToPreview` onto the IMessage (as custom fields)
- [x] 4.4 Create `ChatApp/src/screens/chat/components/` directory
- [x] 4.5 Implement `ReplyPreview.tsx` — composer banner showing "Đang trả lời {displayName}" + preview text (or media-type label) + cancel (X) button; resolve displayName from conversation members by senderId
- [x] 4.6 Implement `QuoteBubble.tsx` — compact quote region rendered at the top of a message bubble when `message.replyTo` is set; tappable; accepts `onPress` prop
- [x] 4.7 Implement `SwipeableBubble.tsx` — wraps a child (GiftedChat Bubble) in `GestureDetector` with `Gesture.Pan()`; threshold 60px; direction varies by message ownership (WhatsApp convention); invokes `onReply(message)` callback when threshold crossed; animates content translate + arrow icon
- [x] 4.8 In `ChatScreen.tsx`, add `replyingTo: IMessage | null` state; compose default send path to include `replyTo: replyingTo?._id` when set
- [x] 4.9 Wire `renderBubble` to wrap its output in `SwipeableBubble` and render `QuoteBubble` above content when message has `replyTo`; `QuoteBubble.onPress` scrolls to original via `giftedChatRef.current?._messageContainerRef.current.scrollToIndex(...)` if message is loaded, else show toast "Không tìm thấy tin nhắn gốc"
- [x] 4.10 Render `ReplyPreview` above the composer when `replyingTo` is set; tapping X clears state
- [x] 4.11 Clear `replyingTo` after a successful send (both online and offline-queue paths) ← (verify: end-to-end smoke — swipe to reply, send, confirm quote appears for both users, tap quote scrolls to original)

## 5. Testing & Verification

- [x] 5.1 Run `cd chat-backend && npm run build` — 0 TypeScript errors
- [x] 5.2 Run `cd chat-backend && npm run lint` — 0 errors in modified files (pre-existing errors in image-processing section are out of scope)
- [x] 5.3 Run `cd chat-backend && npm test` — unit tests pass including new reply validation tests (7/7)
- [x] 5.4 Run `cd ChatApp && npx tsc --noEmit` — 0 errors
- [ ] 5.5 Run `cd ChatApp && npm run lint` — 0 errors (ESLint config missing from ChatApp; pre-existing project issue)
- [ ] 5.6 Manual smoke test: send text/image/video messages; confirm ticks transition pending → ✓ → ✓✓
- [ ] 5.7 Manual smoke test: partner goes online/offline — header updates within ~3 seconds
- [ ] 5.8 Manual smoke test: disable network, send text — bubble shows clock icon; re-enable — bubble transitions to ✓
- [ ] 5.9 Manual smoke test: delete message for me, scroll up, confirm it does NOT reappear; kill backend and attempt delete — confirm rollback + toast
- [ ] 5.10 Manual smoke test: pin message with backend killed — confirm error toast
- [ ] 5.11 Manual smoke test: swipe-to-reply — own message (RTL), other's message (LTR); confirm ReplyPreview appears; send; both sides see QuoteBubble; tap quote scrolls
- [ ] 5.12 Manual smoke test: Vietnamese IME still works in composer (no regression from `onSend` removal or other changes)
- [ ] 5.13 Performance check: scroll 200+ messages fast; no jank; React DevTools shows no re-render spam ← (verify: combined end-to-end coverage — all P0 fixes, all P1 gap closures, reply feature, cross-stack contract integrity)
