## Context

Change #1 (archived) built the token layer but nothing consumes it. The app has 13 primitives, but the audit found real gaps: `KoolaChip` lacks a11y state, `KoolaSurface` `raised` is flat in dark mode, `UserAvatar` hardcodes light-palette chrome (white borders in dark). Several common UI needs have no primitive (bottom sheet, dialog, menu, toast, search field, list item, segmented control), so screens hand-roll them inconsistently. `@gorhom/bottom-sheet@5.2.14` is already installed. `KoolaState` exists and is the base for empty/error states.

This change makes the tokens real on three production screens that serve as the **visual-language approval gate**. The user reviews them on-device; only after approval is the language locked and rolled out to remaining clusters in change #4.

## Goals / Non-Goals

**Goals:**
- Fix the three confirmed primitive defects (Chip a11y, Surface raised dark elevation, Avatar theme-awareness).
- Add the missing primitives with a consistent state matrix + built-in a11y, consuming `useTheme().tokens`.
- Uplift Conversation List, Chat Room, and Settings to the content-first V2 language in light/dark/large-text with applicable runtime-state coverage.
- Keep everything additive and back-compatible; no regression to the ~30 existing token consumers.

**Non-Goals:**
- No `Tooltip` (YAGNI on mobile).
- No other screens (Moments/Connect/Contacts/Calls/Shopping/Auth/Profile = change #4); no broad debt migration (change #3).
- No token rescale/rename; no navigation/IA; no admin-web; no new NativeWind; no BlurView; no perpetual loops; no icon swap; no new heavy dependency.
- Do NOT modify gifted-chat internals, its FlatList perf tuning, or `freezeOnBlur`.

## Decisions

### 1. `KoolaAvatar` new primitive; `UserAvatar` becomes a thin wrapper (recommended default)

- **Choice**: Build `KoolaAvatar` consuming `useTheme().tokens`, with size presets (`xs/sm/md/lg/xl` → concrete px) and an optional `showOnline` indicator slot. Reimplement `UserAvatar` as a thin wrapper mapping its current props onto `KoolaAvatar`, preserving its public API exactly.
- **Rationale**: `UserAvatar` is used across ~27 files; a wrapper fixes dark mode everywhere in one edit with near-zero blast radius and no call-site churn. Full call-site migration is higher risk for no immediate benefit and belongs to change #3/#4 cleanup.
- **Open decision for implementer**: if the wrapper cannot preserve some prop cleanly, migrate only that call site and document why — do not silently drop a prop.
- **Alternatives**: Migrate all call sites now — rejected (churn + risk, out of this change's scope).

### 2. `KoolaSurface.raised` selects elevation by scheme

- **Choice**: In `raised`, branch on `resolvedScheme`: light keeps a light shadow level; dark uses the elevated surface tint (`SurfaceScale`/`koolaDarkShadows`) + optional light hairline. Colors come from `useTheme().tokens`.
- **Rationale**: Matches the content-first depth model already in the living spec (dark elevation via lighter surface, not black shadow). Purely a fix; `raised` API unchanged.

### 3. Overlay primitives wrap what exists; toast has one root host

- **Choice**: `KoolaSheet` wraps `@gorhom/bottom-sheet` (installed). `KoolaMenu` is a mobile action menu and `KoolaDialog` builds on RN core `Modal`/`Pressable` + tokens. `KoolaToast` supplies token-driven renderers to the already-installed root `react-native-toast-message` singleton; it does not create screen-local overlay hosts. Visibility duration derives from motion tokens and no primitive owns a perpetual loop.
- **Rationale**: Meets the "no new heavy dependency" guardrail; reuses proven infra.
- **Alternatives**: Add a menu/toast library — rejected (guardrail).

### 4. State matrix is the contract for every new primitive

- **Choice**: Each new interactive primitive implements, and is unit-tested for, the applicable subset of: default / pressed / focused / disabled / loading / selected / dark / large-text. Non-interactive ones (state presets) cover default/dark/large-text.
- **Rationale**: The audit's core finding was inconsistency; a required matrix makes "done" objective and testable.

Interactive controls use a minimum 44x44 target. `KoolaListItem` renders static content as a non-interactive `View` and only exposes button semantics when `onPress` exists, preventing dead taps and nested button semantics around controls such as `Switch`.

### 4a. Consumer policy avoids fake product work

- **Choice**: The reference screens validate the primitives they naturally need: avatar/state presets, `KoolaListItem`, `KoolaSegmentedControl`, and the root toast renderer. Sheet/Dialog/Menu/SearchField ship as tested migration foundations for changes #3/#4 and are not forced into the three screens.
- **Rationale**: Adding unrelated menus, dialogs, sheets, or search behavior would turn a visual-system change into an unvalidated product/IA change.

### 5. gifted-chat-safe bubble restyle

- **Choice**: All Chat Room bubble visual changes live inside the existing `renderBubble` (and sibling render callbacks) in `ChatScreen.tsx`, pulling colors from `tokens.component.chatBubble.*`. The `GiftedChat` element's props — `renderList`/FlatList tuning (`removeClippedSubviews:false`, `maxToRenderPerBatch:5`, `windowSize:7`, `updateCellsBatchingPeriod:100`) and `freezeOnBlur` — are read-only for this change.
- **Rationale**: These settings were hard-won fixes for Fabric crashes and scroll perf; touching them risks reintroducing known-bad behavior. Restyling within callbacks gets the visual result with zero risk to the transport/list layer.

### 6. Composer dock stays glass (chrome); message list is content-first

- **Choice**: The composer dock keeps its faux-glass chrome treatment via `tokens.component.composer.surface` (GlassSurface). The conversation rows and message bubbles are flat content surfaces separated by surface-levels + hairlines — no drop shadows.
- **Rationale**: Directly applies the content-first rule (glass only on chrome) so the reference screens demonstrate the intended language.

## Risks / Trade-offs

- **UserAvatar wrapper prop drift** → A prop that doesn't map cleanly to `KoolaAvatar`. Mitigation: implementer migrates that single call site and documents; never drops a prop silently.
- **Chat Room visual change tempting a perf-tuning "improvement"** → Mitigation: perf props are declared read-only here; verify diff shows no change to them or to `freezeOnBlur`.
- **Large-text overflow on dense rows (ConversationListItem, ListItem)** → Mitigation: state matrix includes large-text; test at max scaling; use `numberOfLines`/ellipsis, never `maxFontSizeMultiplier={1.0}`.
- **Unused foundation API drift** → Mitigation: changes #3/#4 adopt Sheet/Dialog/Menu/SearchField only at real call sites; their first production consumer owns any API refinement rather than adding fake usage here.
- **Scope creep into other screens** → Mitigation: non-goal stated; only the 3 named screens + their necessary sub-components.
- **`gap`+`flex:1` regression in restyled rows** → Mitigation: run `npm run ui:audit`; use marginRight + flexShrink pattern per ui-dna.

## Migration Plan

1. Land primitive fixes (Chip, Surface, KoolaAvatar + UserAvatar wrapper) — low blast radius, fixes dark mode broadly.
2. Land new primitives + their unit tests.
3. Uplift the 3 reference screens using the new/ fixed primitives + tokens.
4. Run tsc + eslint + jest + `npm run ui:audit`; confirm no perf-prop/freezeOnBlur diff, no token rescale, no audit regression.
5. Reload Metro; **user reviews the 3 screens on-device (approval gate)**.
6. Only after approval: archive (fold the delta into `koola-component-redesign`).

**Rollback**: New primitives are additive (revert files). Screen uplifts are self-contained per screen and revertible; `UserAvatar` wrapper revert restores the old body.

## Resolved Implementation Details

- `KoolaAvatar` presets are `xs/sm/md/lg/xl` = `24/32/40/48/64`; numeric sizes remain supported for back-compat call sites.
- `KoolaMenu` is a bottom action menu on mobile. An anchored popover can be introduced later as a separate variant when a real anchored consumer exists.
