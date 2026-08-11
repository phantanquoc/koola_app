## 1. Phase C1: No-op write suppression (low risk)

- [x] 1.1 Add rowsAffected check to messageRepository.upsertMany — only add conversationId to affectedConvIds when changes > 0
- [x] 1.2 Add value comparison to applySocketEvent message_reaction — skip notify when userId+emoji already exists
- [x] 1.3 Add value comparison to applySocketEvent message_updated — skip notify when all fields identical to current state
- [x] 1.4 Add state check to softDeleteForUser — skip notify when user already in deletedFor array
- [x] 1.5 Add state check to applySocketEvent message_deleted — skip notify when message already marked deleted ← (verify: no-op writes do not trigger useMessagesFromDb reload, confirmed via console logs)

## 2. Phase C1: Tests for no-op suppression

- [x] 2.1 Test messageRepository.upsertMany with ON CONFLICT no-change — verify affectedConvIds excludes no-change conversations
- [x] 2.2 Test applySocketEvent message_reaction with duplicate reaction — verify no notify called
- [x] 2.3 Test applySocketEvent message_updated with identical values — verify no notify called
- [x] 2.4 Test softDeleteForUser when user already deleted — verify no notify called
- [x] 2.5 Test applySocketEvent message_deleted when already deleted — verify no notify called ← (verify: all C1 tests pass, npm test from ChatApp)

## 3. Phase C2: Invalidation payload structure

- [x] 3.1 Define InvalidationPayload interface in invalidationBroadcaster.ts with conversationId, kind, messageIds, orderChanged fields
- [x] 3.2 Update notify function signature to accept optional payload parameter
- [x] 3.3 Update subscribe callback signature to (payload: InvalidationPayload | undefined) => void for backward compatibility
- [x] 3.4 Update flushPending to pass payload through to callbacks ← (verify: broadcaster compiles with new signature, existing subscribers still work)

## 4. Phase C2: Repository payload emission

- [x] 4.1 Update messageRepository.insertOptimistic to call notify with kind='insert', messageIds=[tempId], orderChanged=true
- [x] 4.2 Update messageRepository.upsertMany to call notify with kind='batch' when multiple messages, kind='insert' when single new message
- [x] 4.3 Update applySocketEvent message_reaction to call notify with kind='reaction', affected messageId, orderChanged=false
- [x] 4.4 Update applySocketEvent message_ack to call notify with kind='ack', affected messageId, orderChanged=false
- [x] 4.5 Update applySocketEvent message_updated to call notify with kind='update', affected messageId, orderChanged based on whether createdAt changed
- [x] 4.6 Update applySocketEvent message_deleted to call notify with kind='delete', affected messageId, orderChanged=false
- [x] 4.7 Update markFailed to call notify with kind='update', affected messageId, orderChanged=false ← (verify: all repository writes emit correct payload structure)

## 5. Phase C2: Hook incremental patch logic

- [x] 5.1 Update useMessagesFromDb reload callback to accept payload parameter
- [x] 5.2 Implement insert branch — fetch affected messages, call mergeSorted helper, preserve identity of unchanged
- [x] 5.3 Implement update/reaction/ack branch — fetch affected messages, map current messages replacing only affected IDs
- [x] 5.4 Implement delete branch — filter current messages by messageIds
- [x] 5.5 Implement batch branch — full reload with loadedCountRef.current limit (acceptable for delta sync)
- [x] 5.6 Implement mergeSorted helper — insert new messages at correct createdAt position, preserve existing message identity
- [x] 5.7 Add fallback — if payload undefined, use current full reload behavior for backward compatibility ← (verify: each branch preserves object identity correctly, test with Object.is checks)

## 6. Phase C2: Delta sync batching

- [x] 6.1 Update syncOrchestrator.runDelta to accumulate all pages before notify
- [x] 6.2 Collect affectedConvIds across all pages into single Set
- [x] 6.3 After all pages fetched, call notify once per conversation with kind='batch' and all messageIds from that conversation
- [x] 6.4 Remove per-page notify calls ← (verify: 300-item sync produces 1 notify instead of 3, confirmed via console logs)

## 7. Phase C2: Tests for incremental updates

- [x] 7.1 Test useMessagesFromDb with kind='insert' — verify new message inserted at correct position, others retain identity
- [x] 7.2 Test useMessagesFromDb with kind='reaction' — verify only affected message replaced, others retain identity
- [x] 7.3 Test useMessagesFromDb with kind='ack' — verify only affected message replaced, others retain identity
- [x] 7.4 Test useMessagesFromDb with kind='update' — verify only affected message replaced, others retain identity
- [x] 7.5 Test useMessagesFromDb with kind='delete' — verify only affected message removed, others retain identity
- [x] 7.6 Test useMessagesFromDb with kind='batch' — verify full reload behavior for delta sync
- [x] 7.7 Test mergeSorted helper — insert at start, middle, end; verify correct order and identity preservation
- [x] 7.8 Test optimistic send + ACK flow — verify temp message replaced with server message at same position, no flicker ← (verify: all C2 tests pass, npm test from ChatApp)

## 8. Integration and gates

- [x] 8.1 Run npx tsc --noEmit from ChatApp — verify 0 errors
- [x] 8.2 Run npx jest from ChatApp — verify all tests pass (≥947 from Phase B baseline)
- [x] 8.3 Run npx eslint from ChatApp — verify no new errors vs 304 warning baseline
- [ ] 8.4 Manual test: load conversation with 300 messages, trigger reaction mid-scroll — verify no stutter, console logs show incremental patch not full reload
- [ ] 8.5 Manual test: go offline, accumulate 300 messages, reconnect — verify delta sync produces 1 UI update not 3, scroll remains smooth ← (verify: scroll-while-realtime jank eliminated, measured separately from Phase B pure scroll jank)
