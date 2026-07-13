## Why

Changes #1 (token layer) and #2 (primitives V2 + 3 reference screens) are archived — the token backbone (`useTheme().tokens`) and the new primitives are live. But the app still has a two-tier quality split: the core chat/moments/connect screens look 2026, while high-traffic "tier-two" screens (the shared header, Contacts, Calls, Universal Search, QR scanner, and the reply/quote bubbles in the chat flow) were never migrated — they hardcode colors, so in dark mode they render as white bars / illegible text, and several still use raw `<Text>` and `TouchableOpacity`. On top of that, the Call and Contacts screens ship English-only labels in a Vietnamese app, and the Call control buttons have zero accessibility labels. This change (#3 of 4) closes that dark-mode + localization + a11y debt on the highest-traffic offenders, using the tokens and primitives already shipped. It is deliberately **correctness work, not the full 2026 visual-language uplift** (that is change #4 for the screen clusters).

## What Changes

**Dark-mode / token migration** (→ `useTheme().tokens` + `makeStyles(tokens)`; raw `<Text>`→`KoolaText`; `Touchable*`→`Pressable` with press feedback; add a11y roles/labels/state; use new primitives where they fit):
- **`KoolaHeader`** — highest priority; renders on every home tab; static `koolaColors` → white bar in dark. Migrate to tokens.
- **Contacts** — `ContactsScreen` + `ContactItem` + `ContactSearchBar`.
- **Calls** — `CallsScreen` (add a11y role/label on call-log items).
- **Universal Search** — `UniversalSearchScreen` + `search/ContactResultItem` + `ConversationResultItem` + `MessageResultItem`; use `KoolaSearchField` if it fits; `underlineColorAndroid="transparent"` + `accessibilityLabel` on the input.
- **QR Scanner** — `QrScannerModal`; add tablist/tab roles + `accessibilityState` on the My-QR/Scan tabs; fix the wrong brand blue (`#2196F3` Material → `action.primary`/`#2563EB`); close-button role/label.
- **Chat reply/quote chrome** — `QuoteBubble` + `ReplyPreview` + `SwipeableBubble` (hardcoded colors illegible in dark; arrow `#2196F3`→tokens).
- **Shared chrome** — `OfflineBanner` + `LoadingFooter`.

**Vietnamese localization + a11y (WebRTC-sensitive — text/a11y/color ONLY):**
- **`CallScreen`** — translate ALL English labels ("Mute"→"Tắt tiếng", "Speaker"/"Earpiece", "End"→"Kết thúc", "Connecting..."→"Đang kết nối...", "Call Failed"/"Call Ended", "Flip"/"Show"/"Hide"/"Back"/"Close and Redial"); add `accessibilityRole="button"` + `accessibilityLabel` on every control button (currently none); tokenize danger/success; `KoolaText` where practical.
- **`IncomingCallScreen`** — translate labels ("Decline"/"Accept"/"Video Call"/"Audio Call"); keep existing accept/decline a11y; tokenize.

**Governance:** migrated directories escalate their design-lint rules to `error` where now clean; `npm run ui:audit` counts must drop.

Explicit non-goals (must hold):
- NOT the 2026 visual-language uplift of screen clusters (Moments, Connect, Shopping/Services, Profile, Auth, EditProfile, ChatHome top-tabs) — that is change #4. This change fixes correctness (dark legibility, VN, a11y), not aesthetic redesign.
- **`GroupInfoScreen`** — known legacy-rewrite-deferred; left OUT (deferral noted).
- Media/story/call **viewers** with a legitimate fixed dark overlay (`ImageViewerScreen`, `CoverPhotoViewerScreen`, `MomentViewerScreen`) — keep their intentional dark statics; do NOT convert overlays to palette (trivial a11y labels on close/download only if easy, else defer).
- Assorted small media/chat components not listed (VideoMessage, VideoPlayerModal, FileAttachment, MediaImage, PinBanner, PinListBottomSheet, ForwardModal, MessageContextMenu, ReactionDisplay, AttachmentSheet, GroupCreateModal, MentionTextInput, moments/*, connect/*) — OUT (later cleanup / #4 clusters).
- Do NOT touch: navigation/IA, admin-web, GiftedChat internals + FlatList perf tuning + `freezeOnBlur`, **WebRTC signaling / ICE-SDP / call-lifecycle logic**, media pipeline. No `BlurView`. No perpetual `withRepeat(-1)`. No new NativeWind `className`. No icon-library swap. No new npm dependency. No token rescale/rename (additive-only holds).
- Intentional statics (brand logo colors, legitimate dark media overlays, faux-blur SVG gradient stops) stay literal per `ui-dna.md`.

## Capabilities

### New Capabilities
<!-- None. Extends the existing theme-system capability. -->

### Modified Capabilities
- `mobile-theme-system`: Extend the "in-scope screens consume theme via useTheme" requirement so the set explicitly includes these tier-two high-traffic screens and shared chrome (KoolaHeader, Contacts, Calls, Universal Search, QR scanner, reply/quote bubbles, OfflineBanner, LoadingFooter), and add a requirement that user-facing copy on migrated screens is Vietnamese and that migrated interactive controls carry accessibility roles/labels/state — with the WebRTC Call screens migrated for text/a11y/color only (no signaling/lifecycle change).

## Impact

- **Migrated (tokens + KoolaText + Pressable + a11y)**: `ChatApp/src/components/KoolaHeader.tsx`, `OfflineBanner.tsx`, `LoadingFooter.tsx`; `ChatApp/src/screens/main/ContactsScreen.tsx`, `CallsScreen.tsx`, `UniversalSearchScreen.tsx`, `QrScannerModal.tsx`; `ChatApp/src/components/ContactItem.tsx`, `ContactSearchBar.tsx`, `search/ContactResultItem.tsx`, `search/ConversationResultItem.tsx`, `search/MessageResultItem.tsx`; `ChatApp/src/screens/chat/components/QuoteBubble.tsx`, `ReplyPreview.tsx`, `SwipeableBubble.tsx`.
- **VN + a11y (WebRTC-safe)**: `ChatApp/src/screens/call/CallScreen.tsx`, `IncomingCallScreen.tsx`.
- **Governance**: `ChatApp/eslint.config.mjs` (escalate cleaned dirs to `error`); `npm run ui:audit` counts drop.
- **Back-compat**: no public API changes; behavior preserved (WebRTC/call logic untouched).
- **Dependencies**: none added.

### Audit-count targets (record before/after with `npm run ui:audit`)

Baseline (current): `koolaColors 14 · rawText 27 · touchable 34 · hardcodedHex 38`.

After #3, each count MUST drop by the migrated files' contribution. Approximate targets (exact numbers verified at implementation, some files are also touched by parallel sessions):
- `koolaColors`: 14 → ~8 (KoolaHeader, OfflineBanner, LoadingFooter migrated off static import).
- `rawText`: 27 → ~15 (Contacts/Calls/Search/QR/QuoteBubble/ReplyPreview/Call screens use KoolaText).
- `touchable`: 34 → ~22 (listed screens switch to Pressable).
- `hardcodedHex`: 38 → ~26 (listed screens tokenized; intentional-static viewers remain).
The exact deltas are recorded in the implementation report; the requirement is a measurable DROP with no regressions, not a specific final integer.
