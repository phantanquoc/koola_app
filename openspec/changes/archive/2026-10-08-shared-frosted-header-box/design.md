## Context

`ChatHomeScreen.tsx:639-752` renders an inline frosted block: `ChromeEdgeScrim` + wordmark `87x15 @ TOP 1` + `HeaderSearchDock` pill 36, height `blockH = insets.top + 58`. `ConnectHomeScreen.tsx` renders a separate overlay: `NotchHeader` wordmark `99x17` at stack level plus `ConnectSearchDock` pill 40 and `FilterRow` chips 36 driven by `Animated.Value` on the JS thread. The two chromes drift in size, position, glass tint, and offset calculations. When `ConnectHomeScreen` draws its own overlay, the stack-level `NotchHeader` wordmark remains visible underneath, causing a double wordmark.

`ChatTabStack.tsx:53` already gates the stack header (`showStackHeader = focused !== ChatHome/Chat/Search`) to avoid the double. `ConnectTabStack.tsx` has no gate.

## Goals / Non-Goals

**Goals:**
- Single shared frosted header box geometry and glass across Chat and Connect.
- `HeaderSearchDock` configurable via `rightActions` so Connect shows search-only while the box frame stays identical.
- `ConnectTabStack` hides its wordmark while `ConnectHome` is focused.
- List content starts below the shared box in both tabs.

**Non-Goals:**
- Changing filter/sort/province behavior, BusinessCard, search/profile screens.
- Adding per-tab dock icons (reserved for a follow-up).
- Token or palette changes.

## Decisions

### D1 — Extract `FrostedHeaderBox` as a dumb presentational box

The box owns `blockH`, `ChromeEdgeScrim`, wordmark image, and a dock slot. It takes `insetsTop`, `isDark`, `contentReady`, `onSearchPress`, `rightActions?`, and `hiddenProgress?`. Props are primitives/ReactNode; no navigation coupling. Chat passes QR/+ as `rightActions`, Connect passes empty.

Alternative: keep two inline blocks and sync constants by import. Rejected — still two scrim/wordmark renders to keep in sync.

### D2 — `HeaderSearchDock` gets optional `rightActions`

Current `HeaderSearchDock` requires `onQrPress`/`onAddPress` and always renders two 48-wide icon buttons. Change to optional `rightActions?: React.ReactNode` (or keep shims that map to it). When absent, the pill renders only the search action flexing to full width.

### D3 — Gate mirrors `ChatTabStack`

`ConnectTabStack` tracks `focusedRouteName` via navigator `onStateChange` and computes `showStackHeader = focusedRouteName !== 'ConnectHome'`. This is the same out-of-freeze signal `ChatTabStack` uses to avoid relying on screen `useFocusEffect` cleanup.

### D4 — Offsets recomputed from shared `blockH`

`ChatHomeScreen` keeps `tabBarTop = blockH`; `ConnectHomeScreen` computes `listTopPad = blockH + FILTER_ROW_H + GAP` (filter row sits below the shared box, not inside it). Single formula per screen, derived from the shared constant rather than duplicated literals.

## Risks / Trade-offs

- **Double wordmark if gate is missed** → Mitigation: gate is the same pattern as `ChatTabStack`, verified by visual check (two wordmarks must never overlap).
- **List underlap if offset is off** → Mitigation: `blockH` is a single export from `FrostedHeaderBox`; both screens import it.
- **Connect filter badge (#EF4444) disappears with old dock** → The badge was part of `ConnectSearchDock`; follow-up will reintroduce it as a `rightAction`. Not a regression for this change since the box is search-only by design.
