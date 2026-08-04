## Context

Phase 1 of this effort (archived as `2026-08-04-chat-scroll-jank-phase1`) fixed genuine defects — a dead `isVisible` prop forcing whole-list re-renders, a self-retriggering effect in `MediaImage`, and a full-map `JSON.stringify` on the scroll hot path — but shipped without a performance baseline, so its effect could never be quantified. Phase 2B exists because measurement on real hardware finally isolated where the remaining time goes.

Current state on device `7999fd53` (Xiaomi 2410DPN6CC, Android 16, 120 Hz display, **8.3 ms frame budget**), debug build, automated-swipe gesture:

```
Settings (stock Android)        0.14 %  janky (legacy)  ← device is healthy
Conversation list (same app)    7.83 %                  ← dev-bundle floor
ChatScreen text-only region    43.12 %
ChatScreen media region        38–53 %
```

framestats over 112 frames: avg 1.03 ms, **max 135.29 ms**, and **42/112 = 37.5 %** of frames exceeding 8.3 ms. Phase breakdown on slow frames:

```
draw → sync    40.45 / 48.66 / 51.22 ms   ← DOMINANT (Fabric commit)
anim → trav     5.31 /  5.43 / 17.76 ms   ← secondary (Reanimated worklets)
all other phases          < 3 ms
```

`draw→sync` is the shadow-tree commit window, whose cost tracks mounted view count. Counting from source, one plain text row builds ~17 native views (device average 25.5 with ticks and media layers) against ~12 for a conversation-list row. Six of those layers render nothing.

Constraints inherited from earlier sessions, all confirmed still binding: `removeClippedSubviews` must stay `false` (setting it `true` re-crashed Fabric, facebook/react-native#53258); `react-native-gifted-chat` stays at `^2.8.1` (v3 is EOL and measurably slower); the FlatList batch tuning from 2026-06-30 must not change; `ChatComposer` must not become a controlled input (breaks Vietnamese IME on Fabric).

## Goals / Non-Goals

**Goals:**

- Cut native views per plain text row from ~17 to ≤12, targeting the dominant `draw→sync` cost directly.
- Preserve every visual and interactive behavior exactly — this is a structural change with no intended user-visible difference.
- Preserve link detection in message text without reimplementing it.
- Record the measured baseline, the measurement method, and the five falsified hypotheses in the spec so later work starts from evidence instead of re-deriving it.
- Reach ≤8 % janky frames on the debug build, matching the conversation-list reference.

**Non-Goals:**

- Reaching sub-5 % on a debug build. The conversation list is already lean at ~12 views per row and still measures 7.83 %, so 5 % lies below the dev-bundle floor. Sub-5 % confirmation belongs to a `perf` build and is explicitly deferred.
- Eliminating the day-fade Reanimated worklets in GiftedChat's `Item`. They cost a real but secondary 5–18 ms, they live in `node_modules`, and removing them needs `patch-package`. Deferred so its contribution can be measured separately rather than bundled into this result.
- Replacing the list engine. No FlashList, no LegendList.
- Touching `useMessages.ts`, including its ~550 lines of deliberately-retained dead code.
- Changing `messagesWithAvatar`, which was already verified correct.

## Decisions

### Replace `Bubble` but keep `MessageText`

The redundant layers are inside GiftedChat's `Bubble`, so they cannot be removed while still rendering it. But `Bubble` also dispatches to `MessageText`, which owns URL / phone / email detection, `WWW_URL_PATTERN` scheme repair for schemeless addresses, and `Linking` failure fallback. Hand-porting that risks silently losing tappable links — a functional regression that no performance gain justifies.

Verified feasible before committing to it: `MessageText` is publicly exported at `lib/GiftedChat/index.d.ts:301`, the same barrel `MessageItem` already imports `Bubble` and `Message` from. Its only context dependency is `actionSheet` via `useChatContext`, and rows render inside `<GiftedChat>`, so the provider is always present.

Alternatives considered:

| Option | Views/row | Risk | Outcome |
|--------|-----------|------|---------|
| Replace `Bubble` wholesale, port `MessageText` by hand | ~9 | High — link detection may silently break | Rejected. The extra ~2 views do not justify risking a functional regression. |
| **Replace `Bubble`, keep `MessageText`** | **~11** | **Low — drop empty views, re-host one gesture** | **Chosen.** Cuts ~35 % of views with no feature loss. |
| Deeper memoization only | ~17 | Low | Rejected. Phase 1 already memoized rows; `draw→sync` is *commit* cost, not render frequency. Memoization cannot reduce the size of a tree that does get committed. |
| Status quo | ~17 (25.5 measured) | — | Rejected. This is the defect. |

Commit cost is not an asymptotic problem, it is a constant-factor one: cost is proportional to *views × visible rows per frame*. The conversation list demonstrates the relationship empirically — ~12 views at 7.83 %, ~25.5 views at 38–43 %, so roughly 2× the views yields ~5× the jank, superlinear because each node also carries Yoga layout. Removing six layers attacks the governing variable, and because those layers paint nothing (`View (fill)` and `View (inner)` are pure wrappers; the retry touchable and its wrapper carry `undefined` styles on non-failed messages), removing them cannot change appearance.

### Re-host the long-press gesture before removing its current host

This is the change's one genuine trap. GiftedChat's `TouchableWithoutFeedback` inside `Bubble` is what *triggers* long-press; the screen only supplies the callback. Removing that touchable without re-hosting would leave `handleLongPress` wired but never invoked, silently killing the reaction / reply / pin menu — a failure with no error message.

Verified safe: `handleLongPress` at `ChatScreen.tsx:353` has signature `(_context: unknown, message: IMessage)` and ignores `_context` entirely, using only `message`. The gesture can therefore move to the row's own wrapper without needing GiftedChat's context object.

Two interaction details must survive the move. A failed message must keep single-tap-to-retry *and* long-press-for-menu on the same subtree, so the retry touchable and the long-press host must compose rather than shadow each other. And a tap on a detected link inside `MessageText` must run the link action without also opening the context menu.

### Mount failed-state layers conditionally

The retry `TouchableOpacity` and the `failedBubbleWrapper` `View` currently mount for every message, with `onPress` set to `undefined` and `style` set to `undefined` unless the message failed. Since failure is rare, this is two wasted views on essentially every row. Making them conditional is behavior-preserving by construction: in the non-failed case they contribute nothing today.

### Remove the duplicate `borderRadius` on `MediaImage`'s animated image

`MediaImage.tsx:333` applies `borderRadius: 8` to `Animated.Image` while its parent container at `MediaImage.tsx:351` already applies the same radius with `overflow: 'hidden'`. The duplicate drives Fresco into a rounding path it cannot service, emitting 46 `WrappingUtils: Don't know how to round that drawable` warnings on the main thread. The parent's clipping already produces the visual result, so removing the inner radius changes nothing visually.

This is a small win, included because it is in the same file family and its cost lands on the same thread. It is not expected to move the headline number.

### Keep the type-level prop ledger intact

`MessageItemProps` is policed by `messageItemEquality.ts` via `ComparedPropKey` / `UncomparedPropKey` unions and `MustBeNever` assertions, so adding or removing a prop fails `tsc --noEmit` until it is classified. This guard was added deliberately in Phase 1 after a probe proved the comparator returned "equal" for unknown props — which freezes a row with no crash and no log. Any new prop this change introduces must be declared in the ledger. Bypassing it with a cast or an index signature is prohibited.

## Risks / Trade-offs

**Long-press dies silently after removing GiftedChat's touchable** → Highest-severity risk. Mitigate with a test asserting the long-press handler still fires from the row wrapper, plus on-device confirmation that the menu opens. Failure mode produces no error, so inspection alone is insufficient.

**Bubble geometry drifts and bubbles span the full width** → The 60 dp opposite-side inset, start/end alignment, 20 dp minimum height, and bottom content alignment all come from `Bubble/styles.js`. They are enumerated in the spec delta and must be reproduced exactly. Confirm with screenshots of incoming, outgoing, and very short messages.

**Content composition order changes for mixed-content messages** → The order (leading custom view → image → video → audio → text → trailing custom view) is fixed in the spec. The audio slot is retained even though unused, so a future audio feature does not land in the wrong position.

**Link detection lost** → Directly mitigated by keeping `MessageText` rather than porting it. Confirm on device that a URL and a phone number remain tappable.

**Debug-build measurement cannot prove the sub-5 % goal** → Accepted and documented rather than worked around. The debug target is ≤8 %; sub-5 % requires the `perf` build, whose infrastructure exists (`dotenv.gradle` wiring, `perf` build type, `src/perf/AndroidManifest.xml`, `.env.perf`) but which has not yet been built successfully. Reporting must not conflate the two.

**Working tree already carries uncommitted Phase 1 work** → 7 modified plus 7 new files, alongside the perf build config. Do not stash or revert. A checksum-verified backup exists at `/tmp/koola_phase1_backup/MANIFEST.sha256` should recovery be needed.

**Measurement noise masks or fabricates a result** → Use the identical automated gesture as the baseline (hand scrolling cannot reproduce swipe velocity), discard the first two samples as warm-up, and keep the device on charge with animation scales at 1.0. Note that the device warms up under sustained load, so before and after runs should be taken close together.

## Migration Plan

No data migration, no API change, no dependency change. The change is confined to two component files plus tests, and takes effect on the next JS bundle — no native rebuild is required, since all edits are TypeScript.

Rollback is reverting those files; the type ledger and existing test suite will catch an incomplete revert.

Sequencing matters for attribution: apply the view reduction, measure, and only then consider the deferred day-fade worklet work as a separate change. Bundling them would make it impossible to attribute the improvement.

## Open Questions

- How much of the residual jank is dev-bundle overhead rather than view count? Unknown until a `perf` build succeeds. The conversation-list reference (7.83 % on debug) bounds it: whatever remains above that figure after this change is attributable to ChatScreen's own tree.
- Does the day-fade worklet's 5–18 ms `anim→trav` cost matter once commit cost drops? Deliberately left for a follow-up change with its own measurement, rather than guessed at now.
