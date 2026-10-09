## Context

The Kết nối (Connect) home chrome diverged from the Trò chuyện (Chat) home chrome across three axes: dock actions (search-only vs search + two icons), the filter row (44dp scrolling chip pills vs a 40dp icon sub-tab bar), and glass composition (two sheets split by a hairline vs one continuous sheet). The divergence traces back to a deliberate deferral — `connect-discovery` records that Connect's per-tab dock icons were "reserved for a follow-up" — so this change is that follow-up.

Two Connect features were built but never wired: `QrScannerModal` and `ConnectFilterSheet` are both rendered by `ConnectHomeScreen`, but no code path anywhere in the repo calls `setQrVisible(true)` or `setFilterSheetOpen(true)`. They are unreachable today. Adding the two dock actions is what makes them reachable, so the dock work and the feature wiring are the same task.

The shared header geometry already exists: `ChromeHeaderBox` renders the wordmark (87×15 at `insets.top + 1`), the dock slot, and the box height (`insets.top + 58`), and it already accepts `rightActions`. What is *not* shared is the glass: `ChatHomeScreen` carries its own private glass constants (`CHROME_TINT_LIGHT 'rgba(255,255,255,0.84)'`, `CHROME_TINT_DARK 'rgba(15,20,25,0.72)'`, `CHROME_BLOOM_OPACITY 0.72`, `CHROME_SHADOW_H 14`), its own local `ChromeShadow`, and a deprecated, unused `ChromeEdgeScrim`. `ChromeHeaderBox` carries a *different* set (`0.68` / `0.58` / `0.38`), which is why Connect's header reads lighter than Chat's. Chat passes `withGlass={false}` and paints its own sheet; Connect does not.

Constraints that shape the design:

- `ChatApp/src/screens/main/ConversationListScreen.tsx` is performance-tuned and must not be touched. Its `snapSubTabBar` is private to that file.
- `openspec/specs/mobile-layout-integrity/spec.md` forbids `gap` on row containers whose children use `flex: 1` (RN 0.76 Yoga bug). `npm run ui:audit` already flags `gapFlexRow` in `HeaderSearchDock.tsx`.
- The backend enum is `'partner' | 'supplier'`. No buy/sell concept exists anywhere in the data model, and no form collects one.
- The app has no `@react-native-masked-view` package, and `react-native-svg`'s `SvgText` does not participate in `KoolaText`'s font-scaling contract.

## Goals / Non-Goals

**Goals:**

- Connect and Chat home chrome read as one system: same dock geometry, same subm enu bar height and active treatment, same continuous glass sheet.
- Make `QrScannerModal` and `ConnectFilterSheet` reachable, with the filter sheet's secondary filters surfaced as a badge.
- Relationship display names become one shared source so the same field never carries two names.
- Mock businesses become filterable, and relationship filtering stops leaking items that have no relationship.
- Eliminate the duplicated glass constants so the two tabs cannot drift again.
- Preserve the existing scroll-hide feel on Connect and add a reduce-motion guard.

**Non-Goals:**

- Introducing a real buy/sell request data model. Labels change; slugs and the backend enum do not.
- Changing Chat's visible behaviour. The Chat work here is a pure extraction.
- Touching `ConversationListScreen.tsx`, `SettingsScreen.tsx`, navigation routes, or the backend.
- Fixing the 6 pre-existing `tsc` errors or 6 pre-existing failing Jest suites.
- Replacing the relationship badge icons (`handshake` / `local-shipping`) on the business profile screen.

## Decisions

### 1. Extract the glass into `ChromeGlassSheet` rather than duplicating Chat's constants into Connect

**Chosen**: a new `ChatApp/src/components/ChromeGlassSheet.tsx` owns tint, bloom, hairline, elevation shadow, `zIndex: 10`, and the height animation driven by `hiddenProgress`. Both screens render it.

**Alternatives considered:**
- *Copy Chat's constants into Connect.* Fastest, but leaves two sources for the same visual contract — the exact failure mode that produced this divergence. Rejected.
- *Push the glass into `ChromeHeaderBox` via a new prop.* Would make one component responsible for two different chrome shapes (a box that ends at the dock vs a sheet that extends through the sub-menu bar), and Chat already opts out of the box's glass. Rejected as a worse abstraction.

`ChromeGlassSheet` takes the header block height and the sub-menu bar height, and derives sheet height as `blockH + barH * (1 - hiddenProgress)`. Connect and Chat pass their own values; the formula and the visual constants live in one place.

### 2. Extract `HeaderDockAction` from `HeaderSearchDock`, keep the deprecated props untouched

**Chosen**: export a `HeaderDockAction` component (icon name, `onPress`, accessibility label, optional badge) from `HeaderSearchDock.tsx`. Chat's two inline pressables and Connect's two become four instances of one component.

**Alternatives considered:**
- *Leave Chat's inline pressables and write new ones for Connect.* Four near-identical blocks, and the geometry (48dp width, `scale 0.82`, glyph size 22, pill radius) would be authored twice. Rejected.
- *Delete `onQrPress` / `onAddPress`.* `SettingsScreen` still uses them. Removing them is a separate chore. Rejected — the deprecated path stays and is simply not extended.

### 3. Active sub-menu item uses a primary-coloured label plus a gradient underline, not gradient-filled text

**Chosen**: label colour `semantic.action.primary` for the selected item, `semantic.text.muted` otherwise, plus the same 20×2 gradient underline the Chat sub-tab bar uses.

**Alternatives considered:**
- *Gradient-filled text to mirror Chat's gradient glyphs.* Chat achieves its gradient by rendering the MaterialIcons glyph through `SvgText`. Doing the same for Vietnamese text would require either `@react-native-masked-view` (not installed — a new dependency for a cosmetic detail) or `SvgText` (which bypasses `KoolaText`'s variant-aware `maxFontSizeMultiplier` contract, regressing the font-scaling guarantee this project ships). Rejected. This is a **conscious deviation**: the bar's *format* matches Chat; only the fill technique differs, because text and icon glyphs have different rendering contracts.
- *Plain primary underline without gradient.* Cheaper, but visibly different from Chat's underline and would undercut the "one format" goal.

### 4. Relationship labels: one map, applied everywhere the field renders

**Chosen**: a shared label map in `ChatApp/src/screens/connect/constants.ts` mapping `partner → 'Yêu cầu mua'` and `supplier → 'Yêu cầu bán'`, consumed by the Connect sub-menu bar, `EmptyConnect`, `BusinessProfileScreen`'s badge, and `AccountListScreen`'s picker.

**Why all four**: they all render the same field. Renaming three and leaving one would produce a business that is "Yêu cầu bán" in the list and "Nhà cung cấp" on its profile — a correctness bug, not a style choice. `AccountListScreen` is the business-account sign-up form, so its picker label is what the business owner sees when they self-declare this field; it must match what buyers see.

**Alternative considered:** *renaming only the Connect filter surface.* Would leave the profile badge and the picker inconsistent. Rejected.

### 5. Filtering predicate extracted as a pure function; missing relationship is excluded when filtering

**Chosen**: move the inline mock-filtering predicate out of `ConnectHomeScreen` into a pure exported function, and change the relationship test from `m.relationshipType && m.relationshipType !== filter` to `m.relationshipType !== filter` — so an item with no relationship is dropped when a relationship filter is active.

**Why the current logic is a bug, not a shortcut**: the existing `m.relationshipType && (...) ` guard treats a missing relationship as "passes". With the five mocks all lacking the field, every mock survives every relationship filter. Filtering is supposed to narrow the list; a filter that admits unclassifiable rows is wrong. The one case that must keep behaving as "all" is the `all` filter, which is handled by not passing the filter at all.

### 6. Preserve Connect's existing scroll-hide mechanism, add a reduce-motion guard

**Chosen**: Connect keeps its own `withTiming` binary toggle on `hiddenProgress` (already in place) and adds a reduced-motion check that pins the bar visible.

**Alternative considered:** *port Chat's continuous, velocity-coupled scroll mapping.* That logic lives in `ConversationListScreen.tsx`, which is explicitly out of scope, and copying it would duplicate a third scroll implementation. Connect's discrete toggle already reads acceptably and is not what this change is about. Rejected.

### 7. Sub-menu bar container uses `justifyContent: 'space-between'` with `flex: 1` items and no `gap`

Required by `mobile-layout-integrity`. The row container carries `flexDirection: 'row'`, `justifyContent: 'space-between'`, `paddingHorizontal: 4`, and no `gap`; each item is `flex: 1`. This mirrors Chat's `CustomTabBar` row exactly.

### 8. `ListErrorState` branch reuses the unified chrome

The error branch currently renders a bare `ChromeHeaderBox`. It will render the same glass-less box, glass sheet, and sub-menu bar as the normal state, so chrome does not flicker into a different shape on a failed request.

## Risks / Trade-offs

- **Chat regression from the extraction.** Chat's glass is visual-only chrome on a performance-sensitive screen. → Migration: the extraction is behaviour-preserving by construction (same constants, same heights, same animation source); the accept criteria are the existing hex/geometry values reappearing in `ChromeGlassSheet`, no remaining `CHROME_TINT_*` / `CHROME_BLOOM_OPACITY` / `CHROME_SHADOW_H` definitions in `ChatHomeScreen.tsx`, and Chat's visible output unchanged. `ConversationListScreen.tsx` is not touched, so no scroll-path risk.

- **List inset shifts by 20dp.** Connect's reserve drops from `blockH + 8 + 44 + 8 = blockH + 60` to `blockH + 40`. Rows move up 20dp. → Accepted: this is the intended convergence with Chat, and the spec requires the first card to be fully visible with no empty strip.

- **`AccountListScreen` is a form, not a display surface.** Renaming a picker option changes a form an existing business owner may recognise. → Accepted and required for consistency; the underlying stored value is unchanged, so no data migration and no behavioural change to submission.

- **Two dock actions now open modals that were never exercised in production.** The QR modal path has only been exercised from Chat and Settings; the Connect filter sheet has never been opened at all. → The filter sheet is a `KoolaSheet` and the QR modal is shared with Chat, so the components are proven, but the wiring is new. Device verification of both openings is required before this change is called done.

- **Font scaling on a three-item bar.** Three Vietnamese labels on one row is tighter than four short ones. → Mitigation: `caption` variant (chrome class, capped scale) with `numberOfLines={1}`, and an explicit spec scenario asserting no wrapping or clipping at maximum chrome font scale.

- **Pre-existing failures muddy the signal.** 6 `tsc` errors and 6 failing Jest suites exist on `master`. → Mitigation: they are captured as a baseline before implementation and compared after; the rule is "no increase", not "zero".

## Migration Plan

Single-package (mobile) change; no data or API migration. Order of work:

1. Add `ChromeGlassSheet` and `HeaderDockAction` as new components (nothing consumes them yet — no behaviour change).
2. Point `ChatHomeScreen` at `ChromeGlassSheet` and delete its now-duplicated constants and dead scrim. Chat's output must be unchanged.
3. Add the shared relationship label map, apply it to all four consumers, and update the mock data and the extracted predicate.
4. Rebuild Connect's chrome on the shared pieces: glass-less header box, dock actions, text sub-menu bar, new inset, reduce-motion guard, and the error branch.
5. Add the pure-logic specs.

Rollback is a revert of the single change; no persisted state is written by any of it.

## Open Questions

None. The one ambiguity that existed — whether "Yêu cầu mua / Yêu cầu bán" was a rename of the existing `partner` / `supplier` field or a new data model — was resolved as a rename: the slug count matches one-to-one, no buy/sell concept exists anywhere in the codebase or specs, and no form collects one. The residual naming mismatch (a self-declared `supplier` now displaying as "Yêu cầu bán") is a known consequence of that decision and is recorded here rather than hidden.