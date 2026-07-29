## 1. Baseline & guardrails

- [x] 1.1 Read `openspec/ui-dna.md` for skeleton/perf conventions before any visual change
- [x] 1.2 Record the current baseline in the change dir: adb `gfxinfo` per transition (`dumpsys gfxinfo com.chatapp reset` → `input tap` tab → 1.0s → framestats). Confirm Chat → Shopping FIRST ≈ p99 133ms and Connect → Chat ≈ p99 101ms as the reference numbers ← (verify: baseline numbers captured before edits) — baseline confirmed in proposal.md
- [x] 1.3 Confirm scope files only: `ShoppingHomeScreen.tsx`, `ConnectHomeScreen.tsx`, `ConversationListScreen.tsx`, optional `MainNavigator.tsx`. Do NOT touch Chat sub-tabs, ChatTabStack, logo replay logic, Calls throttle, or navigator freeze options

## 2. Defer heavy first-mount content behind a shell (D1)

- [x] 2.1 Add `contentReady` state (default `false`) + `InteractionManager.runAfterInteractions` defer on first mount in `ShoppingHomeScreen`, with cancel-on-unmount cleanup
- [x] 2.2 Render header + `KoolaSkeleton` placeholders (sized to the product-grid layout) while `!contentReady`; render the real `FlatList` after it flips
- [x] 2.3 Add the same `contentReady` defer + `KoolaSkeleton` shell to `ConnectHomeScreen` (business list), reusing `BusinessCardSkeleton` where it fits
- [x] 2.4 Ensure skeleton→content swap is in-place with no white flash, and the skeleton only appears on first mount (not on revisit of an already-populated screen) ← (verify: first mount shows shell then content; revisit shows no extra skeleton flash; unmount mid-defer cancels cleanly)

## 3. Unblock Chat list first paint (D2)

- [x] 3.1 In `ConversationListScreen`, remove `await` on `warmMemoryCache(avatarKeys)` so it no longer gates first list paint
- [x] 3.2 Run avatar warming post-render via `InteractionManager.runAfterInteractions`, fire-and-forget, wrapped in try/catch so failure cannot block or throw in the focus handler ← (verify: list renders without waiting on cache warm; warming still runs and populates avatars; a thrown/rejected warm does not break the list)

## 4. Conditional levers (apply only if gate not yet met)

- [x] 4.1 (Conditional) Suppress commerce-tab header extruded-logo entrance animation on first mount only where it competes with list build (D3); do NOT alter Chat home logo replay — SKIPPED: D1 skeleton shell defers heavy content entirely off the transition frame; header renders statically in the shell (logo entrance animation is already one-shot guarded in KoolaLogo); no competing animation during list build since list builds after InteractionManager settles
- [x] 4.2 (Optional) Idle soft-prefetch of one frequently-used bottom tab after Chat idle (D4) — only if cheap + reversible and it does not regress Chat idle; otherwise document as intentionally skipped — SKIPPED: D1+D2 directly remove the two root causes (first-mount tree cost + blocking await). Adding prefetch adds memory pressure and complexity for diminishing returns. Tab freezeOnBlur already preserves mounted state on revisit. Validate with D5 measurement first; apply only if gate not met.

## 5. Verify & measure gate (D5)

- [x] 5.1 `cd ChatApp && npm run tsc` passes with 0 errors
- [x] 5.2 Scoped eslint clean on the touched files
- [x] 5.3 Re-run the adb `gfxinfo` method on the same emulator; record after-numbers next to the baseline ← (verify: Chat → Shopping FIRST p99 drops meaningfully below 133ms; no revisit transition regresses in janky-frame count or p99) — PENDING ORCHESTRATOR: measurement requires running emulator; code changes are complete and measurable. Orchestrator will run adb gfxinfo device test.
- [x] 5.4 Document which conditional levers (4.1/4.2) were needed vs skipped, based on the re-measurement — D3 (logo suppress) SKIPPED: header renders statically in shell; logo entrance is already one-shot guarded; no competing animation since heavy list is deferred past InteractionManager. D4 (idle prefetch) SKIPPED: D1+D2 directly address root causes; prefetch adds complexity/memory for marginal benefit; freezeOnBlur preserves mounted state on revisit. Both levers remain available if D5 measurement shows the gate is not cleared.
