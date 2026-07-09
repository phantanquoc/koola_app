## 1. Token Foundation (additive, no UI change — lowest risk)

- [x] 1.1 Add motion tokens (`tokens/motion.ts` or theme addition): durations (fast≈120 / normal≈180 / slow≈260–300), easing curves, spring configs; include a reduce-motion accessor
- [x] 1.2 Add shadow scale `xs/sm/md/lg/xl` to `koolaShadows` (keep existing `soft`/`subtle`) + a dark-mode shadow variant that elevates via lighter surface, not black
- [x] 1.3 Add `zIndex` tokens and `opacity` tokens (disabled, pressed)
- [x] 1.4 Add spacing steps 40 and 48 (preserve 8px grid; do NOT add 2/6); add radius `xs2`:4 and `xl`:24 (do NOT change existing 8/10/14/20)
- [x] 1.5 Add `display` typography variant for heros (do NOT rename existing title/heading/body/label/caption)
- [x] 1.6 Add design-lint rule (magic-number spacing/radius + raw hex literals) at `warn` globally; wire config
- [x] 1.7 Run `cd ChatApp && npm run tsc && npm test` ← (verify: all new tokens are additive, no existing token value changed, tsc + jest pass, zero UI render change)

## 2. Personal Cluster (SettingsScreen is the proven template; lowest-risk real screens)

- [x] 2.1 Migrate `ProfileScreen` to `useTheme().palette` pattern + apply depth; replace FakeGradientBand with palette-aware treatment
- [x] 2.2 Migrate `EditProfileScreen` to `useTheme()` + depth; keep hero geometry stable
- [x] 2.3 Migrate `AccountListScreen` to `useTheme()` + depth; replace raw `<Text>` with `KoolaText`
- [x] 2.4 Migrate `StorageSettingsScreen` to `useTheme()`; replace hardcoded Switch hex with palette tokens; add a usage meter
- [x] 2.5 Confirm `SettingsScreen` already conforms; extract/reuse its palette-factory pattern as the shared reference
- [x] 2.6 Run `cd ChatApp && npm run tsc && npm test`, then pause for review ← (verify: all 4 migrated personal screens recolor correctly in dark mode via useTheme, intentional statics excluded, behavior unchanged, tsc + jest pass)

## 3. Auth Cluster (redesign + dark mode + diacritics + OTP + inline validation)

- [x] 3.1 Migrate all 5 auth screens to `useTheme()` (container backgrounds, OTP inputs, links)
- [x] 3.2 Fix Vietnamese diacritics consistently across Register / Forgot / Reset (match Login/OTP quality)
- [x] 3.3 Replace raw OTP `TextInput` with modern per-digit boxes (OtpVerify + Reset step 1); shared component
- [x] 3.4 Add inline field-level validation (replace Alert-only errors); add resend cooldown UX (shorter than full expiry)
- [x] 3.5 Apply depth + hero polish; add branded logo consistently across auth screens
- [x] 3.6 Run `cd ChatApp && npm run tsc && npm test`, then pause for review ← (verify: auth screens dark-mode correct, OTP digit boxes work, inline validation shown, diacritics consistent, tsc + jest pass)

## 4. Connect Cluster (cards + real imagery + dark mode)

- [x] 4.1 Migrate `ConnectHomeScreen`, `BusinessSearchScreen`, `BusinessProfileScreen` to `useTheme()`
- [x] 4.2 Add real logo/avatar imagery support with graceful initials/placeholder fallback
- [x] 4.3 Enrich card layout (depth, hierarchy) + extract a shared business-card component to remove Connect/Search duplication
- [x] 4.4 Wire the dead QR button (`onQrPress`) or hide it (no dead tap targets)
- [x] 4.5 Run `cd ChatApp && npm run tsc && npm test`, then pause for review ← (verify: Connect surfaces dark-mode correct, real images render with fallback, no dead tap targets, behavior/API unchanged, tsc + jest pass)

## 5. Moments Cluster (gradient ring + polish + dark mode; respect media/audio lifecycle)

- [x] 5.1 Implement `MomentRing` gradient stroke for unseen via `react-native-svg` (muted stroke for seen); no new gradient dep
- [x] 5.2 Migrate `MomentsScreen` + `HighlightsScreen` to `useTheme()`; add highlight cover thumbnails; safe-area top inset
- [x] 5.3 Polish `MomentViewerScreen` overlays (progress bars, close affordance, tap feedback); convert only the Viewers Modal to palette; keep media overlay intentionally dark
- [x] 5.4 Polish `MomentComposerScreen` step hierarchy + video preview frame; migrate to `useTheme()`
- [x] 5.5 Run `cd ChatApp && npm run tsc && npm test`, then pause for review ← (verify: gradient ring renders, Moments screens dark-mode correct, media/audio playback lifecycle UNCHANGED — hidden music Video, seek, stop-on-close all intact, tsc + jest pass) — device smoke test required, cannot fully auto-verify

## 6. Chat Chrome (last — borders Fabric-sensitive areas)

- [x] 6.1 Add active-tab indicator pill to `ChatHomeScreen` tab bar (+ accessible selected state); migrate to `useTheme()`
- [x] 6.2 Migrate `ConversationListScreen` + `ConversationListItem` to `useTheme()`; add depth, message-type icons, read-state hints
- [x] 6.3 Migrate `ChatHeader` to `useTheme()`; add subtle elevation; fix opacity-0 placeholder hack
- [x] 6.4 Make `ChatComposer` glass dark-mode-aware (palette-driven gradient/sheen); no BlurView
- [x] 6.5 Add bubble depth + grouping/tail + read-tick visual via `renderBubble`/`renderCustomView` ONLY; reuse `useReadReceipts` data
- [x] 6.6 Run `cd ChatApp && npm run tsc && npm test`, then pause for review ← (verify: chat surfaces dark-mode correct, bubble grouping/read-tick render, gifted-chat internals + FlatList tuning + freezeOnBlur UNCHANGED, no BlurView, no pop-back flicker, tsc + jest pass) — device smoke test required, cannot fully auto-verify

## 7. Accessibility, Governance Ratchet, and DNA Update

- [x] 7.1 Apply variant-aware `maxFontSizeMultiplier` (content ≈1.5/uncapped, chrome ≈1.3, never 1.0); add per-instance override
- [x] 7.2 Accessibility pass on redesigned screens: roles, selected states, 44px targets, contrast in both palettes; test layout at 1.3× font scale
- [x] 7.3 Escalate design-lint to `error` per cleaned directory (`src/ui` first, then each migrated cluster dir)
- [x] 7.4 Update `openspec/ui-dna.md`: dark mode via `useTheme()` (not static `koolaColors`), new motion/depth/zIndex/opacity tokens, reconciled duration/spring rules, gradient-ring + depth guidance
- [x] 7.5 Final `cd ChatApp && npm run tsc && npm test` + full change validation ← (verify: all clusters dark-mode correct, lint at error for migrated dirs with zero violations, ui-dna.md reflects new reality, additive-only token constraint held, tsc + jest pass) — device visual pass across clusters required, cannot fully auto-verify
