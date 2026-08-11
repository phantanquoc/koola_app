## Why

Chat scroll performance is degraded by two UI-layer issues: (1) MessageItem memo comparator checks reactions by identity, but every SQLite reload creates new reaction arrays via `JSON.parse`, causing 0% memo hit rate even when content unchanged; (2) GiftedChat rebuilds renderItem from parent props, so unrelated ChatScreen state changes (context menu, typing indicator) push render work through the entire message list.

## What Changes

- Fix reactions comparator in `messageItemEquality.ts` to compare by value (array length + per-index userId + emoji) instead of identity
- Add comprehensive tests for reactions value comparison to `messageItemEquality.spec.ts`
- Create memo boundary component (`MemoizedMessageList`) that wraps GiftedChat with stable props
- Update ChatScreen to render GiftedChat through the memo boundary
- Stabilize `listViewProps` reference via useMemo
- Verify all gesture handlers (long-press, tap, avatar) remain functional

## Capabilities

### New Capabilities
- `chat-render-optimization`: Memoization boundaries and comparator fixes to prevent unnecessary message list re-renders during scroll and realtime updates

### Modified Capabilities
- `chat-scroll-performance`: Adds UI-layer optimizations (comparator fix + memo boundary) on top of existing view tree reduction (Phase B) and incremental invalidation (Phase C)

## Impact

**Code:**
- `ChatApp/src/screens/chat/components/messageItemEquality.ts` — replace identity check with value comparison for reactions
- `ChatApp/src/screens/chat/components/messageItemEquality.spec.ts` — add tests for reactions value comparison edge cases (empty arrays, swapped emojis, added/removed reactions)
- `ChatApp/src/screens/chat/ChatScreen.tsx` — wrap GiftedChat in memo boundary, stabilize listViewProps
- New file `ChatApp/src/screens/chat/components/MemoizedMessageList.tsx` — wrapper component with minimal stable props
- Tests for memo boundary behavior (parent state change does not re-render list)

**Dependencies:**
- No new dependencies added
- Relies on existing React.memo and useMemo primitives
- GiftedChat remains at pinned version ^2.8.1

**Type Safety:**
- Type ledger in `messageItemEquality.ts` must remain intact (ComparedPropKey / UncomparedPropKey / MustBeNever guards)
- MemoizedMessageList props must be strongly typed with no any escapes

**Performance:**
- MessageItem memo hit rate improves from 0% to >90% when reactions unchanged
- Parent state changes (typing, context menu) no longer trigger message list re-renders
- Combined with Phase B (view tree) and Phase C (incremental invalidation), targets ≤8% janky frames on debug build
