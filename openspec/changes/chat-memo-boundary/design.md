## Context

Chat scroll performance optimization is a three-phase sequence: Phase B (view tree reduction, archived), Phase C (incremental invalidation, archived), Phase D (this change).

**Current state after Phase C:**
- Message updates are incremental (only affected messages re-fetched)
- No-op writes suppressed
- Delta sync batched

**Remaining bottlenecks (verified via code trace):**

1. **Reactions comparator bug** (`messageItemEquality.ts:149`):
```typescript
// Current (broken):
a.reactions === b.reactions  // identity check

// Every DB read:
JSON.parse(row.reactions || '[]')  // creates new array reference
```
Result: even with Phase C incremental patch, unchanged messages fail memo because `reactions` is always a new array.

2. **GiftedChat props rebuild** (`node_modules/react-native-gifted-chat/lib/MessageContainer/index.js:77-103`):
- GiftedChat rebuilds `renderItem` from entire parent props object
- `Item` component is NOT memoized in GiftedChat internals
- Parent ChatScreen state changes (context menu, typing, network status) propagate through GiftedChat → MessageContainer → every visible row

**Constraints:**
- Type ledger (`ComparedPropKey` / `UncomparedPropKey` / `MustBeNever`) must stay intact — no casts, no index signatures
- Cannot modify GiftedChat internals (node_modules) — wrapper only
- All gesture handlers must remain functional (long-press at ChatScreen.tsx:353 signature is `(_context, message)` and ignores `_context`)
- Phase B and C must not be reverted or modified

## Goals / Non-Goals

**Goals:**
- Fix reactions comparator to compare by value (length + per-index userId + emoji), preserving type ledger
- Create memo boundary around GiftedChat to prevent parent state propagation
- Stabilize `listViewProps` reference via useMemo
- MessageItem memo hit rate improves from 0% to >90% when reactions unchanged
- Parent state changes (typing, context menu) do NOT re-render message list

**Non-Goals:**
- Modifying GiftedChat library code (remain on ^2.8.1, no patch-package)
- Caching parsed reactions in view-model layer (adds state management complexity)
- Optimizing comparator for other fields (reactions is the primary offender)
- Phase E work (media prefetch, windowSize tuning) — deferred

## Decisions

### Decision 1: Reactions comparator strategy

**Chosen:** Value comparison in `messageItemEquality.ts` comparator

```typescript
// Compare array length first (fast path)
if (a.reactions?.length !== b.reactions?.length) return false;

// Then compare each reaction's userId + emoji
for (let i = 0; i < (a.reactions?.length ?? 0); i++) {
  const aReaction = a.reactions![i];
  const bReaction = b.reactions![i];
  if (aReaction.userId !== bReaction.userId || aReaction.emoji !== bReaction.emoji) {
    return false;
  }
}
return true;
```

**Rationale:**
- Localized change (one function)
- No state management needed
- Testable in isolation
- Preserves type ledger (reactions is already ComparedPropKey)

**Alternatives considered:**
- **Cache parsed reactions at view-model layer** (`dbMsgToGifted`) → rejected: requires Map<messageId, reactions[]> cache, eviction policy, memory management
- **Check length only** → rejected: swapping emoji (userId1:👍 ↔ userId2:❤️) preserves length but is different content
- **Deep-equal library** → rejected: overkill for two-field struct, adds dependency

### Decision 2: Memo boundary architecture

**Chosen:** Wrapper component with minimal stable props

```typescript
// New component MemoizedMessageList.tsx
const MemoizedMessageList = React.memo(({
  messages,
  user,
  onSend,
  onLongPress,
  renderMessage,
  listViewProps,
  // ... only props GiftedChat needs
}: MemoizedMessageListProps) => {
  return <GiftedChat {...allProps} />;
});

// ChatScreen.tsx
const stableListViewProps = useMemo(() => ({
  initialNumToRender: 10,
  maxToRenderPerBatch: 5,
  windowSize: 7,
  // ...
}), []); // frozen, never changes

return <MemoizedMessageList messages={messages} listViewProps={stableListViewProps} ... />;
```

**Rationale:**
- Isolates GiftedChat from parent re-renders
- All handlers already stable (useCallback in ChatScreen)
- Simple comparator: default shallow comparison works when props are stable
- No GiftedChat internals touched

**Alternatives considered:**
- **Memoize listViewProps only** → rejected: GiftedChat still sees parent props changes via other unstable references
- **useMemo on entire GiftedChat JSX** → rejected: React.memo on a component is cleaner and more idiomatic
- **Custom comparator for MemoizedMessageList** → rejected: not needed if all props are stable

### Decision 3: Prop stability verification

**Chosen:** Audit all props passed to MemoizedMessageList, ensure stable references

Props that MUST be stable:
- `messages`: already from useState, changes only on invalidation (intended)
- `user`: from auth context, stable unless logout
- `onSend`, `onLongPress`, `renderMessage`: already useCallback
- `listViewProps`: new useMemo with frozen deps

Props that can change without re-render:
- None — all props are intentional render triggers or stable

**Rationale:** Explicit audit prevents accidental inline object/function creation. If any prop is unstable, memo boundary is defeated.

**Alternatives considered:**
- **Use React DevTools Profiler to find unstable props** → rejected as implementation-time check, not design decision
- **Add eslint rule for stable props** → rejected: out of scope, would need custom rule

## Risks / Trade-offs

**[Risk: reactions comparator O(n) per message] → Mitigation:** Reactions arrays are small (typically 0-5 items). Length check is O(1) fast path. Worst case is O(reactions.length × messages.length) during initial mount, but mount already does full render so no new cost.

**[Risk: swapped reactions still fail comparison] → Mitigation:** Per-index comparison means order matters. If backend changes reaction order (e.g., sort by timestamp), this becomes false-negative. Check backend behavior: reactions are append-only, never reordered. If future backend sorts reactions, revisit comparator to sort before compare.

**[Risk: MemoizedMessageList props drift] → Mitigation:** Strong typing on MemoizedMessageListProps. If new prop added to GiftedChat, TypeScript forces it into MemoizedMessageList signature. Verify props at PR review.

**[Risk: gesture handlers break] → Mitigation:** All handlers are pass-through from ChatScreen. Test long-press, tap, avatar tap after implementation. If broken, verify handler reference stability and that MemoizedMessageList doesn't wrap handlers in new functions.

**[Risk: memo boundary defeated by unstable prop] → Mitigation:** Explicit prop audit in this design. Add test: trigger typing indicator, assert message list does NOT re-render (via React DevTools or jest snapshot count).

**[Trade-off: reactions comparison is shallow] → Accepted:** Only compares userId + emoji, ignores other reaction fields if added later. If backend adds reaction.timestamp or reaction.color, comparator must be updated. Document this in messageItemEquality.ts comment.

**[Trade-off: MemoizedMessageList adds indirection] → Accepted:** One extra component in tree, negligible render cost. Benefit (skipping MessageContainer work) vastly outweighs cost.

## Migration Plan

**Phase D1 (comparator fix):**
1. Update `messageItemEquality.ts` reactions check from identity to value comparison
2. Add tests to `messageItemEquality.spec.ts`: empty arrays, identical reactions, swapped reactions, added/removed reactions
3. Verify type ledger still passes (tsc --noEmit)
4. Run full test suite to catch any unexpected memo failures

**Phase D2 (memo boundary):**
1. Create `MemoizedMessageList.tsx` with strong prop types
2. Stabilize `listViewProps` in ChatScreen via useMemo
3. Replace direct GiftedChat render with MemoizedMessageList
4. Verify all gesture handlers functional (long-press, tap, avatar)
5. Add test: typing indicator change does NOT re-render message list

**Deployment:**
- Can deploy D1 independently (pure optimization)
- D2 depends on D1 (memo boundary amplifies comparator fix benefit)
- No feature flag needed (pure performance optimization, no behavior change)
- Rollback: revert commits, no schema change

**Measurement:**
- Automated gates: tsc, jest, eslint
- Device smoke test: scroll while typing, verify no stutter (requires physical device, acknowledged as post-implementation)
- Combined with Phase B + C, target ≤8% janky frames on debug build

## Open Questions

None — all design decisions locked from prior trace.
