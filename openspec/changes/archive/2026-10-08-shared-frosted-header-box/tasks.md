## 1. Shared Frosted Header Box

- [ ] 1.1 Create `ChatApp/src/components/FrostedHeaderBox.tsx` exporting `FROSTED_BOX_WORDMARK_TOP/W/H`, `FROSTED_BOX_DOCK_H/GAP`, `getFrostedBoxHeight(topInset)` and the `FrostedHeaderBox` component (props: `insetsTop`, `isDark`, `contentReady?`, `onSearchPress`, `rightActions?`, `hiddenProgress?`) composing `ChromeEdgeScrim` + wordmark `87x15 @ TOP 1` + `HeaderSearchDock` in an absolute `zIndex: 20` box of height `insetsTop + 58`
- [ ] 1.2 Update `ChatApp/src/components/HeaderSearchDock.tsx` to accept optional `rightActions?: React.ReactNode` (keep deprecated `onQrPress`/`onAddPress` as shims mapping to `rightActions` when provided) and render search-only when `rightActions` is absent; gate the fill-fade Animated style on `hiddenProgress` only when present

## 2. Chat Tab Migration

- [ ] 2.1 Update `ChatApp/src/screens/main/ChatHomeScreen.tsx` to replace the inline frosted View block (ChromeEdgeScrim + wordmark Image + HeaderSearchDock wiring) with `<FrostedHeaderBox>` passing `rightActions` as QR + add icon buttons; keep `blockH = getFrostedBoxHeight(insets.top)` and `tabBarTop = blockH` unchanged in behavior
- [ ] 2.2 Visual check Chat tab — wordmark 87x15 @ TOP 1, pill 36, scrim matches prior inline rendering, no layout shift

## 3. Connect Tab Migration

- [ ] 3.1 Update `ChatApp/src/navigation/ConnectTabStack.tsx` to track `focusedRouteName` via navigator `onStateChange` and compute `showStackHeader = focusedRouteName !== 'ConnectHome'`; hide the stack-level `NotchHeader` wordmark when on `ConnectHome` so only the shared box wordmark is visible
- [ ] 3.2 Update `ChatApp/src/screens/connect/ConnectHomeScreen.tsx` to replace `ConnectSearchDock` + `notchPad/CHROME_RESERVE/overlayChrome` overlay with `<FrostedHeaderBox>` (search-only, no `rightActions`), recompute list `paddingTop` from `getFrostedBoxHeight(insets.top)` plus filter row reserve; remove the local `ConnectSearchDock` component and related constants that are now owned by the shared box
- [ ] 3.3 Visual check Connect tab — wordmark, pill, scrim identical to Chat at rest; no double wordmark at `ConnectHome`; first card fully visible at scroll 0; search pill accessible with label

## 4. Verification

- [ ] 4.1 Run `npx tsc --noEmit` in `ChatApp` — 0 errors across all changed files
- [ ] 4.2 Run `npx eslint` on changed files — 0 errors
- [ ] 4.3 Manual parity check: switch between Tro chuyen and Ket noi at rest — wordmark size/position, pill height/position, and glass appearance match; scrolling does not hide the first row under the box in either tab ← (verify: visual parity and list offset for both tabs)
