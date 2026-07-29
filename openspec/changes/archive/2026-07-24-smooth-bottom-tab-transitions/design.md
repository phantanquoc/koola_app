## Context

Bottom-tab switching feels janky. Measurement (adb `gfxinfo`, emulator-5554, cold start, fixed 1.0s windows) isolates the cause to **first-mount cost**, not missing animation or repeated chrome re-render:

| Transition | p50 | p99 | janky | deadline miss |
|---|---|---|---|---|
| Chat → Shopping FIRST | 17ms | **133ms** | 3 | 3 |
| Shopping → Chat revisit | 17ms | 32ms | 2 | 2 |
| Chat → Connect FIRST | 17ms | 61ms | 2 | 2 |
| Connect → Chat | 18ms | **101ms** | 4 | 4 |
| Personal/Services FIRST | 21ms | 34ms | 1 | 1 |

Prior investigation ruled out three earlier suspects with code + measurement: the Chat logo replay is already `InteractionManager`-deferred (post-land, not transition-blocking), `TabDockBackground` is `React.memo`'d and does not re-render on switch, and `DockAnimatedBorder` is one-shot guarded. The real levers are (a) heavy first-mount tree construction on commerce screens and (b) a blocking `await warmMemoryCache(avatarKeys)` in `ConversationListScreen` that gates first list paint on the Chat re-focus path.

Constraints: RN 0.76.9 Fabric/Hermes. `freezeOnBlur:true` and `removeClippedSubviews:false` are load-bearing (Fabric #53258) and MUST stay. Active `uiux-modernization-roadmap` hard non-goals apply: no BlurView, no controlled ChatComposer, no `freezeOnBlur` removal. `openspec/ui-dna.md` governs any visual change; `KoolaSkeleton` is the sanctioned skeleton primitive (already used in the Moments feed-flash fix and Connect `BusinessCardSkeleton`).

## Goals / Non-Goals

**Goals:**
- Cut first-mount jank on Shopping and Connect so the transition paints an interactive shell on frame 1 and defers heavy tree construction.
- Remove the `warmMemoryCache` await as a first-paint gate on the Chat list (targets Connect → Chat p99 101ms).
- Prove the improvement with the same adb `gfxinfo` method: Shopping FIRST p99 drops meaningfully vs 133ms, no revisit regression.
- Reuse existing patterns (`InteractionManager` defer, `KoolaSkeleton`) — introduce no new abstraction.

**Non-Goals:**
- Chat nested sub-tabs, Chat logo replay logic, Calls focus-fetch throttle.
- `freezeOnBlur` removal, `removeClippedSubviews=true`, FlashList, BlurView.
- ChatTabStack `slide_from_right` pop-back flicker fix (documented, untouched).
- Backend / API / dependency changes.

## Decisions

**D1 — Defer heavy content behind an interactive shell, don't animate over jank.**
Add a `contentReady` state (default `false`) to Shopping and Connect. On first mount, schedule `InteractionManager.runAfterInteractions(() => setContentReady(true))` and cancel on unmount. While `!contentReady`, render header + `KoolaSkeleton` placeholders sized to the real layout; after it flips, render the real `FlatList`. This mirrors the existing ChatHome logo-defer pattern.
- *Alternative rejected:* a cross-fade/slide animation to "hide" the jank — masks the symptom, still drops frames, adds animation cost on the exact frame that is already over budget.
- *Alternative rejected:* `React.startTransition` — Fabric/RN concurrent semantics are not reliable here for a navigation-driven mount; `InteractionManager` is the established in-repo tool.

**D2 — Warm avatar cache after list paint, not before.**
Remove `await` on `warmMemoryCache(avatarKeys)` in `ConversationListScreen`. Move the warming into a post-render fire-and-forget scheduled via `InteractionManager.runAfterInteractions`, wrapped in try/catch so a failure never blocks the focus handler. The list already renders from REST/SQLite state; avatars populate from cache as warming completes (cache is additive, not a render precondition).
- *Alternative rejected:* keep the await but move it after `setConversations` — still runs synchronously inside the focus handler on the same frame budget.

**D3 — Suppress commerce-tab header logo entrance on first mount only, where it competes with list build.**
Where the extruded-logo entrance animation lands on the same frame as heavy list construction (Shopping), render the logo static on first paint. Gate strictly to the commerce tab first mount — do not touch the Chat home logo replay path. Apply only if D1's skeleton does not already absorb the cost; treat as a secondary lever validated by re-measurement.

**D4 — Idle prefetch is optional and gated on cheapness.**
Only if D1–D2 leave headroom and it is cheap + reversible: soft-prefetch one frequently-used tab after Chat goes idle (`InteractionManager` + a low-priority mount hint). Skipped if it risks regressing Chat idle or adds memory pressure. Not required to meet the gate.

**D5 — Measurement is an explicit acceptance task, not a side note.**
tasks.md carries a verify task that re-runs the exact `gfxinfo` method and records before/after. The change is not done until Shopping FIRST p99 improves vs 133ms with no revisit regression.

## Risks / Trade-offs

- **Skeleton flash on fast devices** → gate the skeleton to first mount only and keep the deferred window minimal (`runAfterInteractions` yields as soon as the transition settles); if content is already available synchronously and cheap, the skeleton window is a single frame.
- **Deferred `setContentReady` fires after unmount** → cancel the `InteractionManager` handle in the effect cleanup (same guard as ChatHome logo defer).
- **Moving `warmMemoryCache` changes avatar first-paint timing** → acceptable: avatars are cache-backed and already render progressively; a brief placeholder→cached swap is preferable to a blocked list. Wrapped in try/catch to preserve current failure tolerance.
- **Emulator numbers understate real-device jank** → trust the ranking (first ≫ revisit, Shopping worst); re-measure on the same emulator for apples-to-apples, and note device measurement as follow-up if available.
- **Over-scoping into archived/other-session work** → strict file scope: only the three screens (+ optional MainNavigator for D4). No edits to Chat sub-tabs, ChatTabStack, or navigator freeze options.

## Migration Plan

Pure additive mobile change, no data or API migration. Rollback = revert the touched screen files. No feature flag needed; behavior degrades gracefully (worst case is current behavior).

## Open Questions

- D3/D4 are conditional levers — resolved empirically by the D5 re-measurement. If D1+D2 already clear the gate, D3 and D4 are skipped and documented as unnecessary.
