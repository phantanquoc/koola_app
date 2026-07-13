## Context

Changes #1 (token layer) and #2 (primitives V2 + 3 reference screens) are archived. The token backbone (`useTheme().tokens.semantic` + `.component`, `makeStyles(tokens)`) and new primitives (KoolaAvatar/Sheet/Dialog/Menu/Toast/SearchField/ListItem/SegmentedControl/StatePresets, fixed Chip/Surface) are live. `npm run ui:audit` reports the remaining debt.

The core chat/moments/connect screens look 2026, but high-traffic tier-two screens were never migrated. The audit (baseline: koolaColors 14, rawText 27, touchable 34, hardcodedHex 38) plus the earlier UI/UX audit pinpoint the worst high-traffic offenders: `KoolaHeader` (renders on every home tab → white bar in dark), Contacts, Calls, Universal Search, QR scanner (also using the wrong Material blue `#2196F3`), and the chat reply/quote chrome. Separately, `CallScreen`/`IncomingCallScreen` ship English-only labels with zero a11y on control buttons.

This change closes that debt using the shipped tokens/primitives — correctness (dark legibility) + localization (Vietnamese) + a11y — NOT the aesthetic 2026 uplift (change #4).

## Goals / Non-Goals

**Goals:**
- Migrate the listed tier-two screens + shared chrome to `useTheme().tokens`/`makeStyles(tokens)`, `KoolaText`, `Pressable` + press feedback, with a11y roles/labels/state.
- Vietnamese-ize `CallScreen`/`IncomingCallScreen`/Contacts; add a11y labels to Call control buttons.
- Fix QR scanner's wrong Material blue → brand `action.primary`.
- Reuse #2 primitives where they fit (KoolaSearchField, KoolaListItem, KoolaEmptyState/ErrorState/OfflineState, KoolaAvatar).
- Measurably drop the audit counts with no regression; escalate cleaned dirs' lint rules to `error`.

**Non-Goals:**
- The 2026 visual-language uplift of screen clusters (Moments/Connect/Shopping/Services/Profile/Auth/EditProfile/ChatHome top-tabs) = change #4.
- `GroupInfoScreen` (legacy-rewrite-deferred) — left out.
- Media/story/call viewers with legitimate fixed dark overlays (`ImageViewerScreen`, `CoverPhotoViewerScreen`, `MomentViewerScreen`) — intentional statics kept.
- Assorted small media/chat components not listed — later cleanup / #4.
- No nav/IA, admin-web, GiftedChat internals/perf/`freezeOnBlur`, WebRTC signaling/lifecycle, media pipeline. No BlurView, perpetual loops, new NativeWind, icon swap, new dependency, token rescale.

## Decisions

### 1. File groups (exact scope)

- **G1 — KoolaHeader** (`ChatApp/src/components/KoolaHeader.tsx`): highest blast radius; migrate first to validate the token pattern on shared chrome.
- **G2 — Contacts**: `ChatApp/src/screens/main/ContactsScreen.tsx` + `ChatApp/src/components/ContactItem.tsx` + `ContactSearchBar.tsx`; tokens + VN + a11y; use KoolaEmptyState/ErrorState for its states, KoolaAvatar for rows, KoolaSearchField for the bar if it fits.
- **G3 — Calls**: `ChatApp/src/screens/main/CallsScreen.tsx`; tokens + KoolaText + Pressable; a11y role/label on call-log items.
- **G4 — Universal Search**: `ChatApp/src/screens/main/UniversalSearchScreen.tsx` + `ChatApp/src/components/search/ContactResultItem.tsx` + `ConversationResultItem.tsx` + `MessageResultItem.tsx`; KoolaSearchField if it fits; input `underlineColorAndroid="transparent"` + `accessibilityLabel`.
- **G5 — QR scanner**: `ChatApp/src/screens/main/QrScannerModal.tsx`; tokens + KoolaText; tablist/tab roles + `accessibilityState`; fix `#2196F3` → `tokens.semantic.action.primary`; close-button role/label.
- **G6 — Chat reply/quote chrome**: `ChatApp/src/screens/chat/components/QuoteBubble.tsx` + `ReplyPreview.tsx` + `SwipeableBubble.tsx`; tokens + KoolaText; SwipeableBubble arrow `#2196F3` → tokens (keep its direct-manipulation gesture spring — allowed).
- **G7 — Shared chrome**: `ChatApp/src/components/OfflineBanner.tsx` + `LoadingFooter.tsx`; static koolaColors → tokens.
- **G8 — CallScreen** (WebRTC-safe): `ChatApp/src/screens/call/CallScreen.tsx`.
- **G9 — IncomingCallScreen** (WebRTC-safe): `ChatApp/src/screens/call/IncomingCallScreen.tsx`.

### 2. WebRTC-safe boundary for Call screens (G8/G9)

- **Choice**: Only presentational surface changes — translate JSX string literals, add `accessibilityRole`/`accessibilityLabel` props, swap raw `<Text>`→`KoolaText`, swap hardcoded danger/success hex → tokens. The dark background of the call UI is a legitimate fixed overlay and stays dark.
- **Forbidden**: any change to the WebRTC service, peer-connection setup, ICE/SDP handling, signaling events, or the call state machine / lifecycle handlers. If a color or label lives inside a logic branch, only the literal is changed — never the branch condition or the handler body.
- **Rationale**: WebRTC bugs are extremely hard to reproduce (symptoms appear minutes into a call across networks). Presentation-only edits carry near-zero risk to the call path. Verify by diffing: changes must be confined to JSX text, style/token references, and a11y props.

### 3. Deferrals (explicit)

- **GroupInfoScreen**: known legacy-rewrite-deferred; NOT migrated here. A proper rewrite is a separate future change.
- **Media/story/call viewers** (`ImageViewerScreen`, `CoverPhotoViewerScreen`, `MomentViewerScreen`): their full-screen dark overlays are intentional statics per `ui-dna.md`; NOT converted to palette. Trivial a11y labels on close/download buttons may be added if the edit is one line each; otherwise deferred — do not force it.

### 4. Primitive reuse vs inline tokens

- **Choice**: Prefer the #2 primitives where the layout matches (KoolaSearchField for search inputs, KoolaListItem for simple rows, KoolaEmptyState/ErrorState/OfflineState for states, KoolaAvatar for avatars). Where a screen's existing layout doesn't map cleanly onto a primitive, migrate to tokens inline rather than contorting the layout to fit.
- **Rationale**: The goal is correctness, not a structural rewrite; forcing primitives risks regressions on screens that are otherwise fine structurally.

## Risks / Trade-offs

- **KoolaHeader blast radius** → It renders on every home tab; a mistake shows everywhere. Mitigation: migrate it first (G1) and verify in light+dark before proceeding; it's a small file with a well-defined token mapping.
- **Crossing the WebRTC boundary on Call screens** → Mitigation: presentation-only rule (Decision 2); verify the diff touches only JSX text / style / a11y props, never signaling/lifecycle code.
- **Parallel-session churn** → Some listed files may also be touched by another session (commerce work). Mitigation: scope discipline — only edit the G1–G9 files; report, don't auto-fix, unowned failures.
- **`gap`+`flex:1`-in-row regressions** in migrated rows → Mitigation: run `ui:audit`; apply the marginRight + flexShrink pattern per `ui-dna.md`.
- **Over-migrating into #4 territory** → Mitigation: this is correctness only (dark legibility / VN / a11y), not aesthetic redesign; do not restructure layouts for looks.

## Migration Plan

1. Baseline: record `npm run ui:audit` counts.
2. G1 (KoolaHeader) → verify light+dark on a home tab.
3. G2–G7 (dark-mode/token migration + VN + a11y) in order.
4. G8–G9 (Call screens, WebRTC-safe VN + a11y + tokens).
5. Escalate design-lint rules to `error` for any directory now fully clean for a rule.
6. Run tsc + eslint + jest + `npm run ui:audit`; confirm counts dropped, no regression, no forbidden touches.

**Rollback**: Each work-group is independent and self-contained per file; revert the group's files to restore prior behavior. No shared-state or API changes to unwind.

## Open Questions

- Whether `KoolaSearchField` fully fits the Universal Search and Contacts search bars, or those keep a token-migrated inline input — decided per-file at implementation based on layout fit (Decision 4). Not blocking.
- Exact final audit integers — the requirement is a measurable drop with no regression; precise numbers recorded in the implementation report (some files are co-touched by parallel sessions).
