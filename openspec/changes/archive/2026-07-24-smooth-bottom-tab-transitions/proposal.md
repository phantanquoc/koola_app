## Why

Switching between primary bottom tabs feels janky and laggy, most severely the *first* time a tab is opened. On-device measurement (adb `gfxinfo`, emulator-5554, cold start, fixed 1.0s windows per transition) shows first-mount cost dominates: Chat → Shopping FIRST hits **p99 133ms** (3 janky frames, 3 deadline misses) versus **p99 32ms** on revisit. The Chat re-focus path also spikes — Connect → Chat **p99 101ms** (4 janky, 4 deadline misses) — traced to a blocking `await warmMemoryCache(...)` that gates first list paint. Users expect Zalo/Telegram-class smoothness where tapping a tab paints an interactive shell immediately and heavy work happens off the first frame.

## What Changes

- Bottom-tab screens that carry a heavy first render (Shopping, Connect) SHALL paint an interactive shell/skeleton on the first frame and defer heavy tree construction off the transition, following the existing `InteractionManager` defer pattern already used for the Chat home logo replay.
- The `await warmMemoryCache(avatarKeys)` call in `ConversationListScreen` SHALL no longer block first list paint — avatar cache warming runs after the list is interactive, targeting the Connect → Chat re-focus spike.
- Reuse the existing `KoolaSkeleton` primitive for shell placeholders; no new skeleton system is introduced.
- OPTIONAL (only if cheap and reversible): idle soft-prefetch of a frequently-used bottom tab after the Chat home goes idle.
- Header extruded-logo first-paint cost on commerce tabs MAY render statically (no entrance animation) on first mount only where it competes with list construction — Chat logo replay logic is untouched.
- A measurement acceptance gate: re-run the adb `gfxinfo` method after implementation; Shopping FIRST p99 must drop meaningfully versus the 133ms baseline with no regression on revisit transitions.

Explicitly NOT changing (hard non-goals): Chat nested sub-tabs, Chat logo replay behavior, Calls focus-fetch throttling, `freezeOnBlur` removal, `removeClippedSubviews` (must stay `false` — Fabric #53258), FlashList migration, BlurView, and the documented ChatTabStack `slide_from_right` pop-back flicker fix.

## Capabilities

### New Capabilities
- `mobile-navigation-performance`: Perceived smoothness of primary navigation transitions — first-mount screens paint an interactive shell immediately and defer heavy work off the transition frame; focus-time work does not block first paint.

### Modified Capabilities
<!-- None. mobile-navigation-shell covers layout/theme/visual stability during transitions; transition *performance* is a distinct, new behavioral contract. -->

## Impact

- **Mobile screens**: `ChatApp/src/screens/shopping/ShoppingHomeScreen.tsx`, `ChatApp/src/screens/connect/ConnectHomeScreen.tsx`, `ChatApp/src/screens/main/ConversationListScreen.tsx`.
- **Navigation** (optional prefetch only): `ChatApp/src/navigation/MainNavigator.tsx`.
- **Reused primitives**: `KoolaSkeleton` (`ChatApp/src/ui/KoolaSkeleton.tsx`), `KoolaHeader`.
- **No backend, API, or dependency changes.** Mobile-only, additive, reversible.
- **Verification**: `npm run tsc` + scoped eslint + adb `gfxinfo` re-measure (`dumpsys gfxinfo com.chatapp reset` → `input tap` → 1.0s → framestats).
