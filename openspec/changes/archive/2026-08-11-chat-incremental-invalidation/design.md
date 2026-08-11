## Context

Chat scroll performance is compromised by two independent bottlenecks identified through direct code trace:

1. **Pure scroll**: GiftedChat view tree + Fabric commit cost (addressed in Phase B, archived)
2. **Scroll-while-realtime**: full-window message reload triggered by socket/sync events during scroll

Current invalidation flow (ChatApp/src/services/db/invalidationBroadcaster.ts:17-52, useMessagesFromDb.ts:130-138):
```
socket event → messageRepository write → notify(conversationId) → microtask flush
→ useMessagesFromDb.reload() → SELECT LIMIT loadedCount → map all rows → setMessages(fresh)
```

With 300 loaded messages, a single reaction re-queries and creates 300 new IMessage objects. Every object gets new references for parsed JSON arrays (reactions, readBy). GiftedChat sees every message as changed (even with MessageItem memo) and pushes render work through the list pipeline.

**Verified issues:**
- Line 17-52 invalidationBroadcaster.ts: microtask coalescing (Promise.resolve().then), NOT per-frame as doc claims
- Line 130-138 useMessagesFromDb.ts: full SELECT + remap on every notify
- Line 120-156 syncOrchestrator.ts: upsertMany per 100-item page with network await between → N pages = N notifies
- Lines 450, 599, 631, 649, 670 messageRepository.ts: no-op writes (ON CONFLICT no-change, remove nonexistent reaction, update with same value, delete already deleted) still notify

**Constraints:**
- SQLite LOCAL_FIRST_SQLITE=true is active (flag at ChatApp/src/config/featureFlags.ts:40-43)
- Message order correctness required for new inserts, deletes, optimistic send + ACK
- GiftedChat expects IMessage[] with _id as key; changing _id reference breaks virtualization tracking
- Conversation list, moments feed, and other subscribers to messageRepository must not break

## Goals / Non-Goals

**Goals:**
- Eliminate full-window reload when only one message changes (reaction, ACK, status update, delete)
- Batch delta sync into single UI update (300-item sync = 1 update, not 3 for 3 pages)
- Preserve object identity for unchanged messages so MessageItem memo comparator can skip render
- Suppress notifications for no-op writes (reaction already set, update with same value, delete already deleted)
- Maintain message order correctness, optimistic send flow, and all existing subscribers

**Non-Goals:**
- Phase B view tree reduction (already archived)
- Phase D comparator reactions identity fix or memo boundary (next phase)
- Media prefetch tuning or windowSize changes (Phase E, deferred)
- Frame-level coalescing (animation frame batching) — microtask is sufficient for scroll protection when reload is eliminated
- Migrating away from SQLite or LOCAL_FIRST_SQLITE flag

## Decisions

### Decision 1: Two-phase implementation (C1 then C2)

**Chosen:** Suppress no-op notifies first (C1), then redesign invalidation payload (C2)

**Rationale:** C1 is low-risk and gives immediate benefit (fewer spurious reloads). C2 is the core redesign requiring coordination between broadcaster, repository, and hook. Splitting reduces integration risk and provides a rollback boundary if C2 uncovers edge cases.

**Alternatives considered:**
- Do C2 only (ignore no-op suppression) → rejected: leaves easy wins on the table, and C2 alone doesn't eliminate all full reloads if no-op writes still notify
- Do both in one shot → rejected: too much surface area to verify at once; if a bug appears, attribution is ambiguous

### Decision 2: Invalidation payload structure

**Chosen:**
```ts
interface InvalidationPayload {
  conversationId: string;
  kind: 'insert' | 'update' | 'delete' | 'reaction' | 'ack' | 'batch';
  messageIds: string[];
  orderChanged: boolean;
}
```

**Rationale:**
- `kind` lets hook choose patch strategy (insert needs order check, update/reaction/ack can in-place patch, delete is filter)
- `messageIds` is the minimal contract — hook reads full messages only for these IDs
- `orderChanged` flag avoids re-sort when unnecessary (reaction/status don't change createdAt order)
- `batch` kind signals delta sync accumulation (all page writes coalesced)

**Alternatives considered:**
- Send full message objects in payload → rejected: duplicates data between SQLite and RAM, breaks single-source-of-truth
- Send operation diffs ({messageId, field, newValue}) → rejected: ties repository to hook's state shape, complicates multi-field updates
- No `orderChanged` flag, always re-sort → rejected: unnecessary work for reactions/ACKs which don't change order

### Decision 3: Hook patch strategy

**Chosen:** Separate code paths per mutation kind

```ts
switch (payload.kind) {
  case 'insert': {
    const fresh = await repository.list(conversationId, {ids: payload.messageIds});
    const merged = mergeSorted(currentMessages, fresh); // preserves identity of unchanged
    setMessages(merged);
    break;
  }
  case 'update':
  case 'reaction':
  case 'ack': {
    const updated = await repository.list(conversationId, {ids: payload.messageIds});
    const patched = currentMessages.map(m =>
      payload.messageIds.includes(m._id) ? updated.find(u => u._id === m._id)! : m
    );
    setMessages(patched);
    break;
  }
  case 'delete': {
    setMessages(currentMessages.filter(m => !payload.messageIds.includes(m._id)));
    break;
  }
  case 'batch': {
    // delta sync accumulated pages
    const fresh = await repository.list(conversationId, {limit: loadedCountRef.current});
    setMessages(fresh); // full reload acceptable for sync (one-time on reconnect)
    break;
  }
}
```

**Rationale:** Each mutation has different order/identity requirements. Insert must merge-sort; update/reaction can in-place patch; delete is filter-only. Explicit branches make verification straightforward.

**Alternatives considered:**
- Always full reload → rejected: that's the current problem
- Always merge-sort for every kind → rejected: unnecessary work for updates/deletes
- Single unified patch function → rejected: branches hidden inside one function are harder to test individually

### Decision 4: Delta sync batching

**Chosen:** Accumulate all page upserts in syncOrchestrator, then notify once with kind='batch'

**Rationale:** Delta sync is a bulk operation (user was offline, now catching up). It's acceptable to reload the full window ONCE rather than per-page. The win is reducing N reloads to 1, not eliminating the reload entirely.

**Alternatives considered:**
- Incremental patch per page → rejected: complex to maintain sort order across partial page merges; risk of missing a page or double-counting
- No special batch handling, treat each page as 'insert' → rejected: N expensive merge-sorts instead of 1 full reload

### Decision 5: Backward compatibility for other subscribers

**Chosen:** Invalidation broadcaster callback signature becomes `(payload: InvalidationPayload | undefined) => void`. Subscribers that ignore payload get full reload behavior (safe default).

**Rationale:** Other subscribers (conversation list, moments feed, profile screen) currently expect simple () => void callback. Passing payload as optional argument lets them continue working with full reload until they're migrated. useMessagesFromDb is the only subscriber consuming the payload immediately.

**Alternatives considered:**
- Break all subscribers at once → rejected: increases risk surface; conversation list and moments feed don't have the same reload cost
- Separate new broadcaster, keep old one → rejected: dual codepaths are maintenance burden

## Risks / Trade-offs

**[Risk: merge-sort bug in insert path] → Mitigation:** Comprehensive tests covering insert at start/middle/end, duplicate _id detection, createdAt tie-breaking. Verify against existing list + optimistic send flow (the real-world stress case).

**[Risk: payload.messageIds includes deleted message] → Mitigation:** Repository list({ids}) returns empty for nonexistent IDs. Hook must handle `updated.find()` returning undefined. Test delete followed by update of same ID.

**[Risk: orderChanged flag incorrectly set] → Mitigation:** Repository tracks whether write modified createdAt or _id. Conservatively set true if uncertain. False positive (unnecessary sort) is safe; false negative (skip sort when needed) breaks order.

**[Risk: other subscribers break when payload added] → Mitigation:** Payload is optional argument. Existing subscribers ignore it and continue full reload. Migration to payload is opt-in per subscriber.

**[Risk: batch sync slower than per-page] → Mitigation:** Trade N reloads for 1 reload. Even if the single reload is slower (larger SELECT), eliminating N-1 queries + N-1 React state updates is a net win. Measure scroll-while-sync before/after.

**[Trade-off: batch sync still does full reload] → Accepted:** Delta sync is infrequent (reconnect after offline). The win is 1 reload instead of N, not zero reloads. Zero-reload would require complex incremental merge across pages.

**[Trade-off: hook has more branches] → Accepted:** Explicit per-kind branches make behavior verifiable and testable. The complexity moved from "hidden in full reload" to "explicit in switch cases" — a readability win.

## Migration Plan

**Phase C1 (low risk):**
1. Add rowsAffected / value comparison to messageRepository write operations
2. Only call notify(conversationId) when DB actually changed
3. Test: verify no-op reaction, update, delete do NOT trigger reload
4. Rollback: revert commits, no schema change

**Phase C2 (core redesign):**
1. Extend InvalidationPayload interface in invalidationBroadcaster.ts
2. Update messageRepository to pass payload (kind, messageIds, orderChanged) to notify
3. Update useMessagesFromDb to consume payload and route to patch strategy
4. Accumulate syncOrchestrator pages, notify once with kind='batch'
5. Test: insert/update/reaction/delete/optimistic+ACK/batch sync flows
6. Measure scroll-while-realtime: start scroll, trigger reaction mid-scroll, verify no full reload
7. Rollback: feature flag gating payload usage; if off, fall back to full reload

**Deployment:**
- Phase C1 can deploy independently (pure optimization, no behavior change)
- Phase C2 gated behind feature flag `INCREMENTAL_INVALIDATION` (default off initially)
- Monitor conversation list, moments feed for unexpected reloads after C2 enabled
- Gradual rollout: dev → staging → production over 3 days

**Rollback:**
- C1: revert commits (no schema change)
- C2: set feature flag false (falls back to full reload)
- Nuclear: revert all C1+C2 commits, restart app

## Open Questions

None — all design decisions are locked from prior trace and conversation context.
