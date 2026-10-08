## Why

Chat and Connect tabs render different header chrome: Chat draws an inline frosted block (wordmark 87x15 at TOP 1 + dock pill 36 + ChromeEdgeScrim), while Connect renders NotchHeader wordmark (99x17) plus a separate ConnectSearchDock pill 40. The drift causes visual mismatch (wordmark size/position, pill height, glass tint, offset) and double-wordmark when Connect draws its own overlay on top of the stack NotchHeader.

## What Changes

- Extract the frosted header box from `ChatHomeScreen` into a shared component `FrostedHeaderBox` (wordmark 87x15 @ TOP 1 + DOCK 36 + gap 6 + ChromeEdgeScrim, height `insets.top + 58`) used by both Chat and Connect.
- Make `HeaderSearchDock` configurable via optional `rightActions` slot: Chat passes QR + add buttons, Connect passes empty (search-only pill) — the box frame stays identical.
- Add `focusedRouteName` + `showStackHeader` gate to `ConnectTabStack` (mirroring `ChatTabStack`) so the stack-level NotchHeader wordmark is hidden while `ConnectHome` is focused.
- Migrate `ChatHomeScreen` inline frosted block and `ConnectHomeScreen` overlay chrome to use the shared box; recompute list top offsets from the shared `blockH`.

## Capabilities

### New Capabilities
- `shared-frosted-header-box`: Shared frosted header box (wordmark + search dock + glass scrim) contract used by multiple tabs; geometry, visual parity, and dock configurability.

### Modified Capabilities
- `chat-home-navigation-chrome`: ChatHome migrates from inline frosted block to the shared box — no behavior change, visual parity preserved.
- `connect-discovery`: Connect Home chrome aligns to the shared box; dock becomes search-only.

## Impact

- New file `ChatApp/src/components/FrostedHeaderBox.tsx`
- Modified `ChatApp/src/components/HeaderSearchDock.tsx` (optional rightActions)
- Modified `ChatApp/src/screens/main/ChatHomeScreen.tsx` (use shared box)
- Modified `ChatApp/src/screens/connect/ConnectHomeScreen.tsx` (use shared box, drop ConnectSearchDock, fix offsets)
- Modified `ChatApp/src/navigation/ConnectTabStack.tsx` (gate stack header)
- No backend, no token, no API changes.
