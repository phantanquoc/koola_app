## Why

The chat screen stutters and drops frames while scrolling up and down, and media appears to "re-load" as rows recycle. Deep source tracing (including the compiled `react-native-gifted-chat` sources in `node_modules`) found the jank is **not** one cause but three layers: genuine bugs in our own code, missing memoization on every message-row component, and a per-row cost inside GiftedChat itself.

This change fixes the first two layers — all of which are real defects, not workarounds — and deliberately defers the third until the gain is measured. Two of the fixes are outright bugs that also cause visible incorrectness today: an effect that retriggers itself, and two render callbacks that never pick up a theme change (a live dark-mode defect).

## What Changes

Eight fix groups, all verified against source:

- **Remove the dead `isVisible` prop chain.** `VideoMessage` declares `isVisible` but never reads it, while `ChatScreen` keeps `visibleMessageIds` state that is written during scroll and consumed by `renderMessageVideo`. Every change to the visible-video set re-renders the whole GiftedChat subtree to feed a prop nobody reads. The ±5 media prefetch loop that shares this callback MUST keep working — only the re-render is removed.
- **Fix the `MediaImage` self-retriggering effect.** Its dependency array includes a memo whose identity the effect itself invalidates, so the effect runs twice per image. Separately, an already-cached image is forced back to `opacity: 0` to await a fresh native `onLoad` on every recycle.
- **Stop `touch()` from serializing the entire media index mid-scroll.** `persistMap()` does a full-snapshot `JSON.stringify` + MMKV write; `getFromMemory` always calls `touch()`, and the prefetch loop calls `getFromMemory` up to 11 times per viewability change.
- **Add `React.memo` to the four message-row components** that currently export bare: `MediaImage`, `VideoMessage`, `ReactionDisplay`, `FileAttachment`.
- **Introduce a memoized `MessageItem` via GiftedChat's public `renderMessage` prop**, bypassing GiftedChat's internal `Message`, which runs `lodash.isequal` three times per row per render. The new comparator is field-level, not deep.
- **Stop `renderBubble` identity churning for every row** when the highlighted message changes; move the highlight decision into the memoized row.
- **Fix a live dark-mode defect:** `renderSystemMessage` and `renderDay` declare empty dependency arrays but reference themed styles, so day separators and system messages keep stale colors after a theme switch. This is a visual bug being fixed, not just a perf cleanup.
- **Replace the O(pins × messages) scan** in `usePinManagement` with a single lookup index.

**One intentional visual change**, ruled against `openspec/ui-dna.md`: an image already resolved in the memory cache appears immediately with no fade (the current fade there is a bug). Newly downloaded images keep a fade at `koolaDurations.normal` (180ms) with `koolaEasing.decelerate`, satisfying ui-dna's "micro-interactions MUST stay under 200ms", and skip the fade when `prefersReducedMotion()` is set.

No **BREAKING** changes: all public component props that callers rely on are preserved, except the already-dead `isVisible` prop on `VideoMessage`, which no caller reads.

### Non-Goals (explicitly out of scope)

- Do **not** install or migrate to `@shopify/flash-list` or LegendList.
- Do **not** use `patch-package` or patch anything inside `node_modules`.
- Do **not** upgrade `react-native-gifted-chat` — stay on `^2.8.1`.
- Do **not** set `removeClippedSubviews: true`. It re-crashed Fabric (facebook/react-native#53258) and must stay `false`.
- Do **not** delete the ~550 lines of dead legacy code in `useMessages.ts` (lines 83-632). Separate cleanup; keeps this diff reviewable.
- Do **not** convert `ChatComposer` to a controlled input — Vietnamese IME composition breaks on Fabric.
- Do **not** change the FlatList batch tuning (`initialNumToRender`, `maxToRenderPerBatch`, `windowSize`, `updateCellsBatchingPeriod`). Those values were measured and are the known-good win from a prior sprint.
- Do **not** "fix" `messagesWithAvatar` — it already returns the same array reference when no avatar override applies.

## Capabilities

### New Capabilities

_None._ This change alters how existing behavior is rendered and cached; it introduces no new user-facing capability.

### Modified Capabilities

- `media-message-display`: adds a requirement governing **when** a resolved image is revealed — cache-resolved images appear immediately with no fade; newly downloaded images fade in within the ui-dna micro-interaction budget and honor reduce-motion. Previously unspecified, and currently implemented incorrectly (cached images replay the fade on every recycle).
- `mobile-theme-system`: strengthens the theme-propagation requirement to cover chat day separators and system messages, which currently retain stale colors after a theme change because their render callbacks capture styles in an empty-dependency closure.

`chat-message-presentation`, `pin-message`, and `media-cache-persistence` are **touched but not modified at the requirement level** — the visible bubble contract, pin banner behavior, and LRU eviction semantics are all preserved exactly. `media-cache-persistence`'s LRU requirement depends on `lastAccess` being maintained, so the `touch()` rework must keep that contract intact without changing it.

## Impact

**Files in scope**

- `ChatApp/src/screens/chat/ChatScreen.tsx`
- `ChatApp/src/screens/chat/components/MessageItem.tsx` (new)
- `ChatApp/src/screens/chat/hooks/usePinManagement.ts`
- `ChatApp/src/components/MediaImage.tsx`
- `ChatApp/src/components/VideoMessage.tsx`
- `ChatApp/src/components/ReactionDisplay.tsx`
- `ChatApp/src/components/FileAttachment.tsx`
- `ChatApp/src/services/media/mediaIndexService.ts` (and `mediaCacheService.ts` only if the `touch()` path requires it)

**Blast radius**

`mediaIndexService` is shared app-wide — Moments and avatars read through it, not just chat. Its LRU eviction reads `lastAccess`, so that contract must survive the rework. `impact` on `MediaImage` returned LOW (0 upstream callers). Per project rules, `impact` must be run before editing each remaining symbol, and `detect_changes` before any commit.

**Test coverage risk**

`MediaImage`, `VideoMessage`, `ReactionDisplay`, `FileAttachment`, and `usePinManagement` currently have **zero** test coverage, so these edits land without a safety net. New tests are required for the `isVisible` removal, the `MediaImage` cache-hit path, and `pinnedContents` correctness.

**Dependencies**

None added or removed.

**Deferred follow-up**

GiftedChat runs Reanimated worklets per row (`useSharedValue`/`useDerivedValue`/`useAnimatedStyle` inside its `Item`, plus a `daysPositions.modify()` worklet on every row's `onLayout`) for a day-separator fade. These run *before* the `renderMessage` branch, so this change **cannot** remove them. Eliminating that cost requires either patching the library or replacing the list — a decision deliberately deferred until Phase 1 is measured on a real device with a conversation of ~100+ messages including images.
