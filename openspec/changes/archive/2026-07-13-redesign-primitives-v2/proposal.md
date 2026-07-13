## Why

Change #1 (`redesign-ui-foundations-v2`, archived) shipped the additive 3-tier token layer (`useTheme().tokens.semantic` + `.component`), the `SurfaceScale` primitive, the content-first token direction, and the split design-lint governance — but nothing consumes it yet. This change (#2 of 4 in "Koola UI v2", Track 1) is the first to put the tokens to work: it fixes confirmed primitive defects, builds the shared primitives required by the migration track, and uplifts **three real production screens** to the V2 visual language. Those three screens are the **visual-language approval gate** — the user reviews them on-device before the language is locked and rolled out across the remaining clusters in change #4. This is where the app first *looks* 2026 instead of 2020.

## What Changes

**A) Fix confirmed primitive defects (from the audit)**
- `KoolaChip`: add `accessibilityRole` and `accessibilityState={{ selected }}` (currently missing — screen readers cannot announce chip selection).
- `KoolaSurface` `raised` variant: currently always `koolaShadows.soft`, which is invisible/flat in dark mode. Select dark-mode elevation (lighter surface tint via `SurfaceScale`/`koolaDarkShadows`) when `resolvedScheme === 'dark'`, per the content-first depth model.
- `UserAvatar`: currently hardcodes `koolaColors.canvas`/`koolaColors.surface` → white borders in dark mode. Introduce a theme-aware `KoolaAvatar` primitive (size presets + online-indicator slot) consuming `useTheme().tokens`; `UserAvatar` becomes a thin back-compat wrapper (recommended default — see design).

**B) Build missing primitives for the V2 migration track**
- `KoolaSheet` (wraps the already-installed `@gorhom/bottom-sheet`), `KoolaDialog`, `KoolaMenu`, `KoolaToast`, `KoolaSearchField`, `KoolaListItem`, `KoolaSegmentedControl`.
- State components `KoolaLoadingState` / `KoolaEmptyState` / `KoolaErrorState` / `KoolaOfflineState` (thin presets over the existing `KoolaState`).
- Each consumes `useTheme().tokens`, ships accessibility roles by default, and implements its state matrix (default / pressed / focused / disabled / loading / selected where applicable / dark / large-text).
- `KoolaListItem`, `KoolaSegmentedControl`, avatar/state presets, and the root toast host have production consumers in this change. `KoolaSheet`, `KoolaDialog`, `KoolaMenu`, and `KoolaSearchField` are foundation APIs for changes #3/#4; they SHALL NOT be wired into a reference screen through fake or product-changing usage merely to satisfy a consumer count.
- **`Tooltip` is explicitly NOT built** (no mobile use case — YAGNI).

**C) Uplift 3 real production screens to V2 (the approval gate)**
- **Conversation List** — `ConversationListScreen.tsx` + `ConversationListItem.tsx`.
- **Chat Room** — `ChatScreen.tsx` (+ `ChatComposer`/`ChatHeader` chrome). Bubbles are restyled **strictly within `gifted-chat` render callbacks**; gifted-chat, its FlatList perf tuning (`removeClippedSubviews:false`, `maxToRenderPerBatch:5`, `windowSize:7`, `updateCellsBatchingPeriod:100`), and `freezeOnBlur` are untouched.
- **Settings** — `SettingsScreen.tsx`.
- Each uplifted screen consumes `useTheme().tokens` via `makeStyles(tokens)`, applies content-first depth (flat content surfaces + surface-levels + hairlines; glass only on chrome like the composer dock; brand hue only for actions/signals), and provides its applicable loading/empty/offline/error states in light AND dark, surviving large-text.

**Completion gate:** this change is NOT archived until the user approves the three reference screens on-device.

Explicit non-goals (must hold):
- Consume tokens via `useTheme().tokens` + `makeStyles(tokens)`; `makeStyles(palette)` is legacy only.
- No rescale/rename of any existing token (additive-only holds); new primitives/screens only ADD.
- No navigation/IA changes (Track 2); no `admin-web`; no cross-app token pipeline.
- No new NativeWind `className` in production; no `BlurView`; no perpetual `withRepeat(-1)` loops; no icon-library swap (keep MaterialIcons).
- Keep GiftedChat + its perf tuning + `freezeOnBlur` untouched.
- No new heavy npm dependency (wrapping the installed `@gorhom/bottom-sheet` is allowed; adding a new sheet/menu/toast library is NOT).
- Only these 3 screens are uplifted here. The remaining clusters (Moments, Connect, Contacts, Calls, Shopping/Services, Auth, Profile/EditProfile, …) are change #4. The broad 16/27/34/40 debt migration is change #3 — except the files this change necessarily touches (the 3 screens, `ConversationListItem`, `ChatComposer`/`ChatHeader`, `UserAvatar`/`KoolaAvatar`).

## Capabilities

### New Capabilities
<!-- None. Extends the existing component-redesign capability. -->

### Modified Capabilities
- `koola-component-redesign`: Add requirements for (a) primitive accessibility + dark-mode correctness (KoolaChip a11y state, KoolaSurface raised dark elevation, KoolaAvatar theme-aware), (b) the missing primitive inventory (Sheet, Dialog, Menu, Toast, SearchField, ListItem, SegmentedControl, Loading/Empty/Error/Offline states) each with a required applicable state matrix and built-in accessibility semantics, consuming `useTheme().tokens`, and (c) the content-first V2 uplift of the three reference production surfaces (Conversation List, Chat Room within gifted-chat callbacks, Settings) with light/dark/large-text and applicable runtime-state coverage, gated on user on-device approval before archive.

## Impact

- **New primitives**: `ChatApp/src/ui/KoolaAvatar.tsx`, `KoolaSheet.tsx`, `KoolaDialog.tsx`, `KoolaMenu.tsx`, `KoolaToast.tsx`, `KoolaSearchField.tsx`, `KoolaListItem.tsx`, `KoolaSegmentedControl.tsx`, and loading/empty/error/offline presets in `KoolaStatePresets.tsx`; barrel updates in `ChatApp/src/ui/index.ts`.
- **Fixed primitives**: `ChatApp/src/ui/KoolaChip.tsx`, `ChatApp/src/ui/KoolaSurface.tsx`, `ChatApp/src/components/UserAvatar.tsx`.
- **Uplifted screens**: `ChatApp/src/screens/main/ConversationListScreen.tsx`, `ChatApp/src/components/ConversationListItem.tsx`, `ChatApp/src/screens/chat/ChatScreen.tsx`, `ChatApp/src/screens/chat/components/ChatComposer.tsx`, `ChatApp/src/screens/chat/components/ChatHeader.tsx`, `ChatApp/src/screens/main/SettingsScreen.tsx`.
- **Tests**: primitive unit tests (roles/state matrix/dark) under `ChatApp/src/ui/__tests__/`.
- **Governance**: `npm run ui:audit` counts should not regress; migrated files/dirs may escalate their design-lint rules to `error` where now clean.
- **Dependencies**: no new npm packages (wraps existing `@gorhom/bottom-sheet`).
- **Back-compat**: `UserAvatar` keeps its existing public API via wrapper and adds an optional online state; `KoolaState` remains the shared base and is migrated from legacy palette access to semantic tokens.
