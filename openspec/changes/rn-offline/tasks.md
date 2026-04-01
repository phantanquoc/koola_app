## 1. Backend: Sync Endpoint

- [x] 1.1 Create `chat-backend/src/messages/dto/sync-messages.dto.ts` — DTO with `@IsOptional()` `@IsDateString()` for `since`, `@IsOptional()` `@IsString()` for `cursor`, `@IsOptional()` `@IsInt()` `@Min(1)` `@Max(100)` for `limit` (default 100)
- [x] 1.2 Add `syncMessages(since: string, cursor?: string, limit?: number)` method to `MessagesService` — query `createdAt > since` (AND `_id > cursor` if provided), sort ascending, limit+1 for pagination check ← (verify: query returns messages in ascending order, cursor pagination works, only returns messages where user is a participant)
- [x] 1.3 Add `GET /messages/sync` endpoint to `MessagesController` — query params from DTO, calls `messagesService.syncMessages`, returns `{ items: Message[], hasMore: boolean, nextCursor: string | null }` ← (verify: endpoint is protected by `@ApiBearerAuth`, returns correct shape, returns 401 without token)

## 2. RN: OfflineQueueService

- [x] 2.1 Create `ChatApp/src/services/OfflineQueueService.ts` — singleton class with `queue: QueuedMessage[]` (in-memory) + `listeners: Set<() => void>` (event emitter pattern)
- [x] 2.2 Implement `add(message)` — append to queue, persist to AsyncStorage key `offline_queue`, notify listeners ← (verify: queue persists to AsyncStorage, listener fires on add)
- [x] 2.3 Implement `remove(id)` — filter by id, persist updated queue, notify listeners
- [x] 2.4 Implement `updateStatus(id, status)` — update item in queue, persist
- [x] 2.5 Implement `processQueue()` — iterate queue in order, for each: POST `/messages`, on 200 remove from queue, on failure increment `retryCount`, apply `min(2^retryCount * 1000, 30000)` delay, cap at 5 retries (remove + mark failed) ← (verify: exponential backoff formula correct, 5 retries then removal, HTTP 200 removes from queue)
- [x] 2.6 Implement `restore()` — load queue from AsyncStorage on init
- [x] 2.7 Implement `subscribe(listener)` and `unsubscribe(listener)` — return unsubscribe fn

## 3. RN: useNetworkStatus Hook

- [x] 3.1 Create `ChatApp/src/hooks/useNetworkStatus.ts` — use `@react-native-community/netinfo` `useNetInfo()` to expose `isConnected: boolean` ← (verify: hook returns false when airplane mode on, true when connected)
- [x] 3.2 Add `onConnectivityChange(isConnected: boolean)` callback prop — called on every connectivity change

## 4. RN: useOfflineQueue Hook

- [x] 4.1 Create `ChatApp/src/hooks/useOfflineQueue.ts` — subscribe to `OfflineQueueService`, expose `{ queue, sendViaQueue, retryMessage, removeFromQueue }` ← (verify: queue state syncs with OfflineQueueService, sendViaQueue adds to queue and returns optimistic message)
- [x] 4.2 Implement `sendViaQueue(msg)` — generates `clientMessageId` (uuid), creates `QueuedMessage` with `status: 'pending'`, adds to service
- [x] 4.3 Implement `retryMessage(id)` — resets `retryCount` to 0, updates status to 'pending', calls `processQueue()`
- [x] 4.4 Implement `removeFromQueue(id)` — removes from service

## 5. RN: useMessageSync Hook

- [x] 5.1 Create `ChatApp/src/hooks/useMessageSync.ts` — `sync()` function: calls `GET /messages/sync?since=lastSyncAt`, paginates if `hasMore`, saves new `lastSyncAt` to AsyncStorage ← (verify: pagination loops correctly, lastSyncAt persists to AsyncStorage)
- [x] 5.2 `sync()` deduplicates incoming messages by `_id` against existing messages, returns merged list
- [x] 5.3 `restoreLastSyncAt()` — reads from AsyncStorage on init

## 6. RN: OfflineBanner Component

- [x] 6.1 Create `ChatApp/src/components/OfflineBanner.tsx` — renders fixed position banner at top when `isVisible=true`, shows "No internet connection. Messages will be sent when you're back online.", cyan background (#E0F7FA), dark text ← (verify: banner shows/hides based on isVisible prop, does not crash when shown on any screen)

## 7. RN: ChatScreen Integration

- [x] 7.1 Update `ChatApp/src/screens/chat/ChatScreen.tsx` — add `useNetworkStatus`, `useOfflineQueue`, render `OfflineBanner` when `!isConnected` ← (verify: banner shows when offline, hidden when online)
- [x] 7.2 Update `sendMessage` in `ChatScreen` → use `useOfflineQueue.sendViaQueue()` instead of direct API call (or wrap: online → direct POST, offline → queue) ← (verify: message shows as pending immediately on send, status updates to 'sent' on ACK, shows 'failed' after 5 retries)
- [x] 7.3 Handle failed messages — on queue item reaching max retries, call `updateMessageStatus(tempId, 'failed')` with retry callback

## 8. RN: App Init + Socket Lifecycle

- [x] 8.1 Update `ChatApp/src/App.tsx` — call `OfflineQueueService.restore()` on mount ← (verify: queue is restored on app restart, pending messages re-appear)
- [x] 8.2 Update `AuthContext.tsx` login/logout — on login success: call `sync()` then `processQueue()` in sequence; on network offline: `socketService.disconnect()`; on network online: `socketService.connect()` + `sync()` + `processQueue()`
- [x] 8.3 Update `ConversationListScreen` — on mount, if online, call `sync()` once with current `lastSyncAt` ← (handled in AuthContext; ConversationListScreen refreshes via useFocusEffect)

## 9. TypeScript + Verification

- [x] 9.1 Run `npx tsc --noEmit` in `chat-backend/` — fix any type errors in sync endpoint
- [x] 9.2 Run `npx tsc --noEmit` in `ChatApp/` — fix any type errors in new hooks and services
- [x] 9.3 Review all `// TODO` / `// FIXME` comments added during implementation and address
- [x] 9.4 Run `openspec verify rn-offline` — confirm all tasks pass verification
