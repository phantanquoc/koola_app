## Why

Five independent current-state surveys of the Koola mobile app converged on the same verdict: the product is "Functional" — it works, but it looks like a flat 2020 prototype. Three systemic weaknesses make the app feel dated: (1) dark mode is broken on nearly every screen (~350+ static `koolaColors` references across ~44 files; only `SettingsScreen` uses the correct `useTheme()` pattern), (2) surfaces are visually flat with no depth, motion, or modern affordances (flat bubbles, no chat tab indicator, a flat orange Moments ring instead of a gradient), and (3) production discovery surfaces show generic icons instead of real imagery. This change delivers a "2026" component-level redesign of the production surfaces while folding the dark-mode correctness fix into the same pass, so each screen is touched once.

## What Changes

- Introduce a **2026 design language**: additive design tokens for depth (shadow scale + dark-mode shadow variant), motion (durations, easing, spring configs with a reconciled spring rule), plus additive `zIndex`, `opacity`, `spacing` (40/48), `radius` (xs2/xl), and a `display` typography variant. **No existing token VALUES are rescaled** (avoids visual regression).
- **Component-level redesign** of production surfaces: Auth, Chat chrome, Moments, Connect, Personal. Each screen gains depth, modern affordances, and correct dark mode in a single touch.
- **Fold the dark-mode fix in**: convert ~350 static `koolaColors` sites to the `useTheme().palette` pattern proven by `SettingsScreen`, excluding intentional statics (brand logo colors, media/viewer dark overlays, faux-blur SVG gradient stops).
- **Moments gradient ring** replacing the flat orange border, drawn with the existing `react-native-svg` dependency (no new gradient library).
- **Auth polish**: fix Vietnamese diacritics inconsistency across 3 screens, replace the raw OTP `TextInput` with modern digit boxes, and add inline validation instead of Alert-only errors.
- **Chat depth**: bubble depth / grouping / tail and a read-tick visual, implemented strictly within `gifted-chat` `renderBubble` callbacks (the library is NOT replaced); a chat tab-bar active indicator pill.
- **Connect imagery**: real logo/avatar support and richer cards on Connect and business profile surfaces.
- **Governance**: add a design-lint rule (ratcheting warn→error per directory) that blocks magic-number spacing/radius and raw hex literals in `src/ui` and migrated screens.
- **Update `openspec/ui-dna.md`** to reflect: dark mode via `useTheme()` (not static `koolaColors`), the new motion/depth tokens, and the reconciled duration/spring rules.
- Delivered as **incremental, revert-safe batches** with a pause-for-review between user-visible batches, complementing (not duplicating) the existing `uiux-modernization-roadmap` governance.

Explicit non-goals (must hold throughout):
- **Services + Shopping screens are OUT** — they are non-functional mockups (hardcoded data, dead handlers); redesigning them is polishing dead wireframes. Deferred until they become real features.
- **No styling-backbone swap** — Unistyles / Restyle are DEFERRED. The redesign uses the proven `useTheme()` pattern. A backbone migration is a separate future spike, not part of this change.
- **No new heavy UI dependency**. Gradient ring uses existing `react-native-svg`. Haptic feedback and the Inter font may be proposed but require the dependency-approval gate — treated as optional/gated, never assumed.
- **Fabric safety lines**: no `BlurView` reintroduction (keep faux-blur SVG); do NOT touch `gifted-chat` internals, the `FlatList` perf tuning (`removeClippedSubviews:false`, `maxToRenderPerBatch:5`, `windowSize:7`, `updateCellsBatchingPeriod:100`), or `freezeOnBlur`; do NOT touch the media pipeline (`mediaCacheService`, blurhash, presigned URLs); the brand **mark** (tri-arc ring) stays FLAT — never gradient/shadow (only the wordmark may be dimensional).

## Capabilities

### New Capabilities
- `koola-design-tokens`: The additive 2026 token layer — depth/shadow scale (+ dark-mode shadow variant), motion tokens (duration/easing/spring) with the reconciled spring rule, and additive `zIndex`, `opacity`, `spacing`, `radius`, and `display` typography tokens, plus the additive-only constraint that forbids rescaling existing token values.
- `koola-component-redesign`: The 2026 component-level visual language and per-cluster redesign requirements for production surfaces (Auth, Chat chrome, Moments, Connect, Personal), including depth application, modern affordances (tab indicator, gradient ring, bubble grouping/tail, OTP digit boxes, real imagery), the incremental revert-safe batch governance, and the design-lint governance ratchet.

### Modified Capabilities
- `mobile-theme-system`: Adds a requirement that in-scope production screens consume theme colors via `useTheme().palette` (per the `SettingsScreen` pattern) rather than static `koolaColors`, and defines the intentional-static exclusions (brand logo colors, media/viewer dark overlays, faux-blur gradient stops).

## Impact

- **Tokens/foundation**: `ChatApp/src/ui/theme.ts` (additive tokens), new `ChatApp/src/ui/tokens/motion.ts` (or equivalent), `ChatApp/src/ui/ThemeProvider.tsx` (unchanged runtime; consumed more widely).
- **Primitives** under `ChatApp/src/ui/` may gain depth/variant/a11y refinements (additive).
- **Screens** (dark-mode conversion + redesign): Auth (`LoginScreen`, `RegisterScreen`, `OtpVerifyScreen`, `ForgotPasswordScreen`, `ResetPasswordScreen`), Chat (`ChatHomeScreen`, `ConversationListScreen`, `ConversationListItem`, `ChatScreen`, `ChatHeader`, `ChatComposer`), Moments (`MomentsScreen`, `MomentRing`, `MomentViewerScreen`, `MomentComposerScreen`, `HighlightsScreen`), Connect (`ConnectHomeScreen`, `BusinessSearchScreen`, `BusinessProfileScreen`), Personal (`ProfileScreen`, `EditProfileScreen`, `AccountListScreen`, `StorageSettingsScreen`).
- **Governance/config**: ESLint / design-lint config for `src/ui` and migrated directories; `openspec/ui-dna.md` documentation update.
- **Not touched**: backend, Socket.IO contracts, `gifted-chat` internals, `FlatList` perf tuning, `freezeOnBlur`, media pipeline, navigation route contracts, Services/Shopping mockups, styling backbone.
- **Verification**: `cd ChatApp && npm run tsc` + `jest` per batch; several device smoke tests (chat pop-back, Moments media lifecycle, dark-mode visual pass) require an Android device and cannot be automated.
