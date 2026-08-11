## Why

Chat scroll becomes janky when socket events (reactions, ACKs, incoming messages) or sync operations arrive during scrolling. The root cause is full-window message reload triggered by every database write notification, even when only one message changed. With 300 loaded messages, a single reaction re-queries and rebuilds all 300 message objects, breaking React object identity and forcing GiftedChat to re-render all mounted rows. This change eliminates realtime/sync jank by replacing full reload with incremental patching and suppressing no-op write notifications.

## What Changes

- Suppress database notifications for writes that changed nothing (no-op reactions, updates with identical values, deletes already deleted)
- Extend invalidation broadcaster from bare callback to carrying mutation metadata (conversation ID, mutation kind, affected message IDs, order change flag)
- Replace full-window `SELECT + remap + setMessages(fresh)` with incremental patch that preserves object identity for unchanged messages
- Batch delta sync pages into single UI update instead of one notify per 100-item page
- Add tests for incremental update correctness (insertion order, reaction updates, delete, optimistic + ACK flow)

## Capabilities

### New Capabilities
- `chat-incremental-invalidation`: Incremental message state updates that preserve object identity for unchanged messages and batch multi-page sync into a single UI update

### Modified Capabilities
- `chat-scroll-performance`: Adds requirement that scroll-while-realtime (reaction/ACK during scroll) must not reload the entire loaded message window
- `chat-message-persistence`: Adds requirement that database write operations only notify when data actually changed (checked via rowsAffected or value comparison)

## Impact

**Code:**
- `ChatApp/src/services/db/invalidationBroadcaster.ts` — broadcaster callback signature changes from `() => void` to `(payload: InvalidationPayload) => void`
- `ChatApp/src/screens/chat/hooks/useMessagesFromDb.ts` — reload function replaces full `SELECT + setMessages(fresh)` with targeted patch logic
- `ChatApp/src/services/sync/syncOrchestrator.ts` — delta sync accumulates pages before single notify instead of notify per page
- `ChatApp/src/services/db/messageRepository.ts` — write operations check rowsAffected/compare values before notify

**Behavior:**
- Message list no longer creates new object references for every message on every socket event
- Delta sync of 300 items produces 1 UI update instead of 3 (for 3 pages of 100 items each)
- Scroll-while-realtime jank eliminated (measured separately from pure scroll jank addressed in Phase B)

**Dependencies:**
- No new dependencies
- No dependency version changes
