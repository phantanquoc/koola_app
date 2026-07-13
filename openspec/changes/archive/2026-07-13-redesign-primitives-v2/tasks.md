## 1. Fix confirmed primitive defects

- [x] 1.1 `ChatApp/src/ui/KoolaChip.tsx`: add/merge `accessibilityRole` and `accessibilityState={{ selected, disabled }}`; token-driven selected/focus/pressed treatment and a 44px target.
- [x] 1.2 `ChatApp/src/ui/KoolaSurface.tsx`: make `raised` select elevation by `resolvedScheme` — light shadow level in light, elevated surface tint (`SurfaceScale`/`koolaDarkShadows`) + optional light hairline in dark; colors from `useTheme().tokens`. `raised` API unchanged.
- [x] 1.3 Add `ChatApp/src/ui/KoolaAvatar.tsx` consuming `useTheme().tokens`: size presets + optional online-indicator slot + image/initials fallback with theme-appropriate chrome.
- [x] 1.4 Reimplement `ChatApp/src/components/UserAvatar.tsx` as a thin wrapper over `KoolaAvatar`, preserving its public API exactly (migrate a single call site only if a prop cannot map, and document it). ← (verify: Chip announces selected state; raised reads elevated in dark; UserAvatar renders correctly in dark with no white border; existing call sites compile unchanged)

## 2. Build missing primitives (state matrix + a11y, consume tokens)

- [x] 2.1 `ChatApp/src/ui/KoolaSheet.tsx` — wrap the installed `@gorhom/bottom-sheet` (no new dependency); token-driven surface, a11y roles on actions.
- [x] 2.2 `ChatApp/src/ui/KoolaDialog.tsx` — modal dialog (RN core + tokens); title/body/action slots with roles.
- [x] 2.3 `ChatApp/src/ui/KoolaMenu.tsx` — bottom action menu; items expose role + selected/disabled state and large-text-safe labels.
- [x] 2.4 `ChatApp/src/ui/KoolaToast.tsx` — token-driven renderer for the existing root `react-native-toast-message` singleton; no screen-local host, no perpetual loops, visibility uses duration tokens.
- [x] 2.5 `ChatApp/src/ui/KoolaSearchField.tsx` — search input; `underlineColorAndroid="transparent"`, `accessibilityLabel`, clear affordance.
- [x] 2.6 `ChatApp/src/ui/KoolaListItem.tsx` — icon/leading + text + trailing/chevron row; `accessibilityRole`, press feedback, large-text safe (no `maxFontSizeMultiplier={1.0}`).
- [x] 2.7 `ChatApp/src/ui/KoolaSegmentedControl.tsx` — tablist/tab roles + `accessibilityState={{ selected }}`; token-driven selected treatment.
- [x] 2.8 `KoolaLoadingState` / `KoolaEmptyState` / `KoolaErrorState` / `KoolaOfflineState` in `ChatApp/src/ui/KoolaStatePresets.tsx` — thin semantic-token presets over existing `KoolaState`.
- [x] 2.9 Update `ChatApp/src/ui/index.ts` barrel to export all new primitives. ← (verify: each primitive honors its applicable state matrix in light+dark+large-text; a11y roles present by default; KoolaSheet wraps gorhom with no new dep; no Tooltip added)

## 3. Primitive unit tests

- [x] 3.1 Add tests under `ChatApp/src/ui/__tests__/` covering: KoolaChip merged a11y state; KoolaSurface raised dark vs light; KoolaAvatar sizes/online/fallback; interactive/static ListItem semantics; SearchField clear target/action; SegmentedControl roles/selection/action; Sheet modal contract; loading/empty/error/offline states; toast live region. ← (verify: 51 focused primitive/token tests pass; large-text contract asserts scaling remains enabled)

## 4. Uplift Conversation List (reference screen 1)

- [x] 4.1 `ChatApp/src/screens/main/ConversationListScreen.tsx`: consume `useTheme().tokens` via `makeStyles(tokens)`; content-first surfaces; loading/empty/offline/error via state primitives; pull-to-refresh tint from tokens.
- [x] 4.2 `ChatApp/src/components/ConversationListItem.tsx`: token-driven flat row (surface-level + hairline, no drop shadow), unread via `signal.unread`, use the `UserAvatar` back-compat wrapper over `KoolaAvatar` with its online slot; fix any `gap`+`flex:1`-in-row per ui-dna; large-text safe. ← (verify: recolors light↔dark without restart; content-first depth; all runtime states covered; ui:audit shows no new gap+flex:1 regression)

## 5. Uplift Chat Room (reference screen 2)

- [x] 5.1 `ChatApp/src/screens/chat/ChatScreen.tsx`: restyle bubbles STRICTLY within `renderBubble`/render callbacks using `tokens.component.chatBubble.*`; do NOT touch GiftedChat internals, FlatList perf tuning, or `freezeOnBlur`.
- [x] 5.2 `ChatApp/src/screens/chat/components/ChatComposer.tsx`: keep faux-glass chrome via `tokens.component.composer.surface` (GlassSurface); tokenize remaining colors.
- [x] 5.3 `ChatApp/src/screens/chat/components/ChatHeader.tsx`: tokenize; content-first; a11y intact. ← (verify: bubble changes only in render callbacks; diff shows NO change to removeClippedSubviews/maxToRenderPerBatch/windowSize/updateCellsBatchingPeriod/freezeOnBlur; light+dark correct)

## 6. Uplift Settings (reference screen 3)

- [x] 6.1 `ChatApp/src/screens/main/SettingsScreen.tsx`: migrate to `useTheme().tokens` + `makeStyles(tokens)`; use flat full-width bands instead of raised card sections, `KoolaListItem` for static/interactive rows, and `KoolaSegmentedControl` for the theme control; content-first; large-text safe. ← (verify: actionable rows have press feedback; static/Switch rows do not announce dead buttons; recolors light↔dark; segmented control announces selection)

## 7. Verification + approval gate

- [x] 7.1 Run tsc, eslint, jest, and `npm run ui:audit` from `ChatApp/`; confirm green, no token rescale/rename, no perf-prop/`freezeOnBlur` diff, no new NativeWind className, no new dependency, audit not regressed. ← (result: tsc exit 0; eslint exit 0 with 0 errors and the existing warning ratchet; Jest 39/39 suites, 664 passed + 1 skipped, exit 0 after test lifecycle cleanup; UI audit improved to 14/27/34/38/28)
- [x] 7.2 Escalate design-lint rules to `error` for any directory now fully clean for a given rule (per the ratchet); do NOT flip project-wide. ← (result: no new directory became fully clean — uplifted files are clean but their parent directories still contain non-scope files with violations; existing ratchets unchanged)
- [ ] 7.3 Reload Metro and present the 3 reference screens for on-device user approval; the change is NOT archived until approved. ← (result: Android debug build installed on Pixel_8 API 35; Conversation List, Chat Room, and Settings smoke-tested with Metro in light/dark and Settings at font scale 1.3; no ReactNativeJS/AndroidRuntime errors; user approval is the only remaining archive gate)
