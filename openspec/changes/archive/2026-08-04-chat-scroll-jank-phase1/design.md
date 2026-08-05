## Context

The chat screen stutters while scrolling. Deep source tracing — including the compiled `react-native-gifted-chat@2.8.1` sources in `node_modules` — found three independent layers of cost, not one:

```
Layer 3  GiftedChat internals      per-row Reanimated worklets + 3× lodash.isequal per row
   ↑                               (cannot be reached from props)
Layer 2  our row components        zero React.memo on any message-row component
   ↑
Layer 1  our own bugs              dead prop chain re-rendering the list, self-retriggering
                                   effect, full-map JSON.stringify mid-scroll
```

This change addresses Layers 1 and 2. Layer 3 is deferred deliberately (see Non-Goals).

**Current runtime state.** `LOCAL_FIRST_SQLITE = true` in both `ChatApp/dev-config.json` and `ChatApp/.env`, so `useMessages` delegates entirely to `useMessagesFromDb` and returns at line 74. The chat data path is SQLite-backed and reactive via `invalidationBroadcaster`, which coalesces notifications per microtask.

**Constraints that bound the solution space.**

- Fabric (RN 0.76.9, New Architecture) is on. `removeClippedSubviews: true` previously re-crashed the app via facebook/react-native#53258 and must stay `false`.
- `ChatComposer` must remain an uncontrolled input; a controlled input breaks Vietnamese IME composition on Fabric.
- The FlatList batch tuning was measured in a prior sprint and is the known-good configuration.
- `mediaIndexService` is shared app-wide (Moments, avatars), not chat-only, and its LRU eviction reads `lastAccess`.
- `MediaImage`, `VideoMessage`, `ReactionDisplay`, `FileAttachment`, and `usePinManagement` have **zero** existing test coverage.

## Goals / Non-Goals

**Goals:**

- Eliminate re-renders of the whole message list that are triggered by scrolling.
- Stop synchronous full-snapshot serialization on the JS thread during scroll.
- Make every message-row component skip re-render when its own data is unchanged.
- Replace GiftedChat's three deep-equality comparisons per row with field-level comparison.
- Fix two defects that are visible today: a doubled image-resolution effect, and day separators / system messages that keep stale colors after a theme switch.
- Preserve every existing visual behavior of the message bubble exactly.

**Non-Goals:**

- Replacing the list implementation (`@shopify/flash-list`, LegendList).
- Patching `node_modules` via `patch-package`.
- Upgrading `react-native-gifted-chat`.
- Removing the per-row Reanimated worklets — architecturally impossible from props (see Decision 5).
- Deleting the ~550 lines of dead legacy code in `useMessages.ts` lines 83-632.
- Changing FlatList batch tuning or `removeClippedSubviews`.
- Touching `messagesWithAvatar`, which is already correct.

## Decisions

### Decision 1: Delete the `isVisible` chain rather than wire it up

`VideoMessage` declares an `isVisible` prop but destructures only `{ message, onPress }` — the body never reads it. The chain that feeds it (`visibleMessageIds` state, written during scroll, consumed by `renderMessageVideo`'s dependency list) therefore re-renders the entire GiftedChat subtree to supply a value nobody consumes.

Chosen: remove the state, the prop, and the dependency.

Alternative considered — implement real viewport-gated video autoplay: rejected for this change. The `<Video>` preview was previously removed because of a Fabric "child already has a parent" crash, so re-introducing mounting/unmounting video views during scroll would reintroduce that risk while this change is trying to *reduce* scroll cost. Autoplay remains available as separate future work.

**Hard constraint:** the same `onViewableItemsChanged` callback also runs the ±5 neighbor media prefetch. That prefetch must keep working; only its re-render side effect is removed. Since the callback is already held in a `useRef` and prefetch needs no React state, prefetch can continue writing to refs only.

### Decision 2: Break the `MediaImage` effect's self-dependency, and separate "resolved" from "revealed"

Two distinct defects share this component:

*Self-retrigger:* the resolution effect lists a memo among its dependencies whose identity the effect itself invalidates by recording image dimensions. Sequence: effect runs → measures → records dimensions → re-render → memo identity changes → effect re-runs. Fix by removing the derived dimension value from the effect's re-run condition and reading it through a ref or recomputing it inside, so recording dimensions cannot re-enter the effect.

*Wasted reveal round-trip:* after resolution the component resets its "ready" marker to null, forcing an already-cached image back to `opacity: 0` to await a fresh native `onLoad`. Fix by treating a synchronous memory-cache hit as already-revealed.

Chosen: reveal state is derived from *how* the URI was obtained — synchronous cache hit means revealed immediately; asynchronous download means fade once.

Alternative considered — always reveal immediately, drop fades entirely: rejected. A fade on genuinely new content is intentional design; `openspec/ui-dna.md` sanctions it within the micro-interaction budget. Only the *replayed* fade on cached content is the bug.

### Decision 3: Keep `lastAccess` in memory; stop serializing the whole map on the hot path

`persistMap()` builds a full snapshot object and `JSON.stringify`s it. `touch()` calls this past its debounce window, `getFromMemory` always calls `touch()`, and the prefetch loop calls `getFromMemory` up to 11 times per viewability change. So scrolling can trigger repeated whole-index serialization on the JS thread, and the cost grows with index size.

Chosen: `touch()` updates `lastAccess` in the in-memory map synchronously (cheap, and what eviction reads), but defers persistence off the scroll-critical path — batched/idle-scheduled rather than inline — and coalesces so a burst of touches costs at most one write.

Constraints this must respect:
- `evictIfNeeded` reads `lastAccess`; in-memory values stay authoritative and current, so eviction ordering is unchanged.
- Durability requirement is weak by nature: `lastAccess` is LRU bookkeeping, not user data. Losing the last few seconds of access timestamps on a hard kill degrades eviction ordering slightly and loses nothing a user can observe.
- Structural writes (`set`, `deleteEntry`) keep persisting promptly — they carry the file paths that make the cache work across restarts, which `media-cache-persistence` requires.

Alternative considered — per-key MMKV entries instead of one snapshot blob: cleaner asymptotically, but changes the on-disk layout and would need a migration plus a rewrite of `load()`/`iterate()`, expanding blast radius into Moments and avatars for a hot-path problem solvable without it. Recorded as possible future cleanup.

### Decision 4: `React.memo` with default shallow comparison on the four row components

`MediaImage`, `VideoMessage`, `ReactionDisplay`, and `FileAttachment` all export bare. All four receive primitive props plus, in some cases, callbacks. Default shallow comparison is correct provided the parent passes stable callbacks — which Decision 5's memoized row makes true.

`ReactionDisplay` receives an `onPress` closure built per row; that closure must be stabilized (or the identity absorbed into the memoized row) or the memo will never hit. This is called out as a task-level verification point.

### Decision 5: Bypass GiftedChat's internal `Message` via the public `renderMessage` prop

`Message/index.js:70-78` memoizes with a comparator that runs `lodash.isequal` three times per row per render — deep-comparing `currentMessage`, `previousMessage`, and `nextMessage`. On message objects carrying reactions, media metadata, and `readBy` arrays, that is substantial per-row work on every list render.

`renderMessage` is a public prop (`GiftedChat/types.d.ts:87`), and `Item/index.js:82-83` calls `renderMessageProp(rest)` *instead of* rendering internal `Message`. Supplying it therefore replaces both the deep comparator and the internal `Message` wrapper with our own memoized `MessageItem`.

The new comparator compares only fields that can actually change a row's appearance: `_id`, status/`messageStatus`, `pending`, `failed`, `readBy` length, `reactions`, `uploadProgress`, plus the neighbor sender ids needed for consecutive-message grouping.

`MessageItem` must reproduce, with no visual difference, everything `renderBubble` produces today: `isLastInGroup` tail-radius grouping, the story-reply card, the failed-state retry affordance and label, delivery tick icons (pending / sent / read), and the reaction row. It must also keep rendering GiftedChat's `Bubble` internally so `renderMessageImage`, `renderMessageVideo`, `renderCustomView`, and `renderTime` continue to be invoked as they are now.

Alternative considered — `shouldUpdateMessage`: **not viable.** At `Message/index.js:71` it is OR'd with the deep-equality checks, so it can only *force* additional renders, never prevent one. It cannot suppress the deep compares.

**Honest limitation.** GiftedChat's `Item` calls `useSharedValue`, `useDerivedValue`, and `useAnimatedStyle` at lines 55-60 — *before* the `renderMessage` branch at line 82 — and `MessageContainer`'s `CellRendererComponent` runs a `daysPositions.modify()` worklet on every row's `onLayout`. Additionally its `renderItem` is a `useCallback` keyed on `[props]`, so its identity changes on every parent render. **None of this is removable via `renderMessage`.** This change removes the deep-compare cost and our own re-render triggers; it does not remove the per-row worklet cost. Any claim that this change eliminates Layer 3 would be false.

### Decision 6: Move the highlight decision into the row

`renderBubble`'s dependency list includes `highlightedMessageId`, so toggling a highlight re-creates the callback and invalidates *every* row. Chosen: pass the target id into the memoized row and let each row derive its own `isHighlighted` boolean, so a highlight change re-renders one row instead of all of them.

### Decision 7: Correct dependency arrays instead of hoisting the callbacks

`renderSystemMessage` and `renderDay` declare `[]` while referencing themed styles, permanently capturing the first palette. Chosen: declare the real dependencies. This is the minimal correct fix and it makes the callbacks recreate exactly when the theme changes — which is the required behavior, not a perf regression, since theme changes are rare.

### Decision 8: Single lookup index for pinned message contents

`usePinManagement` derives `pinnedContents` by running `messages.find(...)` once per pin, on every messages change — O(pins × messages), rescanning a growing array. Chosen: build one `Map` from message id to message in a single pass, then look up each pin. Output shape stays identical so `PinBanner` and `PinListBottomSheet` are unaffected.

## Risks / Trade-offs

- **`MessageItem` is a visual-fidelity risk — the largest in this change.** Reimplementing the row means the tail-radius grouping, story-reply card, tick states, failed state, or reaction row could shift subtly. → Port the existing `renderBubble` body wholesale rather than rewriting it; keep `chat-message-presentation` scenarios green; the existing `ChatScreen.presentation.spec.tsx` and `ChatScreen.failed-bubble.spec.tsx` assert the token and delivery-state contracts and must stay passing.

- **Too aggressive a comparator silently freezes rows.** A row that omits a field which does change appearance will stop updating — and this fails *invisibly*, which is worse than a crash. → Comparator field list is enumerated in Decision 5 and mirrors exactly the fields `renderBubble` reads; reaction, tick, and upload-progress updates are explicit verification points.

- **`mediaIndexService` is shared app-wide.** A regression there degrades Moments and avatars, not just chat. → Keep the public API and on-disk format unchanged; only persistence *timing* moves. Preserve prompt persistence for structural writes.

- **Deferred `lastAccess` persistence weakens durability slightly.** A hard process kill can lose recent access timestamps. → Acceptable and bounded: this is LRU bookkeeping, in-memory values stay authoritative for eviction, and the worst case is marginally suboptimal eviction ordering with no user-visible effect.

- **Zero existing coverage on five of the touched files.** → New tests are mandatory for the `isVisible` removal, the `MediaImage` cache-hit path, and `pinnedContents` correctness.

- **Reveal-timing change could surface a flash of the fallback background.** Revealing a cached image immediately means the blurhash/fallback layer must be gone on the same frame, not a frame later. → Derive both from the same resolved state so they commit together.

- **No measured baseline exists.** The emulator's conversation list is empty (no rows to open; `dumpsys gfxinfo` reports `Total frames rendered: 0`; no `ReactNativeJS` output in logcat). → Do **not** report a speedup figure. If a conversation of ~100+ messages with images cannot be seeded, report the work as code-complete-but-unmeasured. When measuring, discard the first two gfxinfo samples as warmup noise, and set `MSYS_NO_PATHCONV=1` for `adb shell` with Unix paths on Windows Git Bash.

## Migration Plan

No data migration, no dependency change, no on-disk format change. The work is pure client-side refactoring plus two bug fixes.

Rollback is a straight revert of the change's commits. The riskiest unit is `MessageItem` — if it regresses visually and a fix is not immediate, removing the `renderMessage` prop from the `GiftedChat` element restores GiftedChat's internal `Message` path and the previous rendering exactly, while keeping fix groups 1, 2, 3, 4, 6, 7, and 8 in place. That makes the largest risk independently revertible.

Sequencing: land the independent fixes (1, 2, 3, 4, 7, 8) before the coupled pair (5 and 6, which share the row), so a `MessageItem` problem cannot mask the other fixes.

## Open Questions

None blocking implementation. Two items are explicitly deferred rather than unresolved:

1. **How to remove the per-row Reanimated worklets (Layer 3)** — `patch-package` against 2.8.1 versus hand-rolling the list on FlashList v2. Deferred by design until Phase 1 is measured on a device, since the measurement determines whether the remaining cost justifies either option.
2. **Whether to migrate `mediaIndexService` to per-key MMKV entries** — unnecessary for this change's hot path; revisit only if index size becomes a problem on its own.
