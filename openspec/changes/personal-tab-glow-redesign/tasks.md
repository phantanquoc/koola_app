## 1. Theme primitives (additive)

- [x] 1.1 Add `koolaLightField`, `koolaGlowShadows`, `koolaIconWell`, and `koolaFocusGlow` primitives to `ChatApp/src/ui/theme.ts` with exact light and dark values from design.md D1/D2/D3/D7; export them from the theme module
- [x] 1.2 Confirm additive-only: no existing token value, key, or variant in `theme.ts` changed ← (verify: git diff of theme.ts shows only new exports; existing koolaColors/koolaDarkColors/koolaRadii/koolaSpacing/koolaTypography/koolaShadows/koolaDarkShadows blocks byte-identical)

## 2. Personal card components

- [x] 2.1 Create `ChatApp/src/screens/main/components/personal/LightFieldBackground.tsx`: memoized static Svg radial blooms from `koolaLightField`, pointerEvents none, absolute fill
- [x] 2.2 Create `PersonalCard.tsx`: KoolaSurface-based card with radius/padding/margins and per-scheme glow shadow from D2
- [x] 2.3 Create `PersonalIconRow.tsx`: icon-well row (36px well, glyph from semantic tokens, title/value slots, optional trailing, optional onPress with pressed state and accessibility role)
- [x] 2.4 Create `PersonalProfileCard.tsx`: avatar with ring, uppercase name (heading/800, 2 lines), subtitle email-else-phone, edit hint, divider, account-switch row ← (verify: components compile under tsc and consume only semantic tokens + new primitives, no hardcoded hex outside theme.ts)

## 3. SettingsScreen recomposition

- [x] 3.1 Add notch header (D5) above the scroll content with KoolaLogo and status bar inset
- [x] 3.2 Replace flat sections with: profile card, "Thông tin tài khoản" card (phone row hidden when absent), "Cài đặt & bảo mật" card containing theme segmented control, auto-translate switch, language row, notifications switch, privacy, about, storage rows; keep every existing handler, busy state, rollback, and Alert unchanged
- [x] 3.3 Restyle logout as outlined danger pill; keep `logout` wiring ← (implemented through an additive `dangerOutline` variant on `KoolaButton`: surface fill + danger hairline border + danger label/icon; existing variant keys and values untouched)
- [x] 3.4 Restyle language picker Modal sheet and options to card language without changing selection/rollback behavior
- [x] 3.5 Keep `__DEV__` Logo Lab row in its own card at the end ← (verify: diff review shows no handler, API call, navigation target, or state logic changed; only JSX structure and styles)

## 4. Dock focused-tab glow

- [x] 4.1 In `MainNavigator.tsx` TabBarItemComponent add svg gradient ring + tabFocus glow shadow around the icon well for the focused item, opacity driven by the existing focus progress shared value (D7)
- [x] 4.2 Apply to all five tabs via shared code path; unfocused items render no ring ← (verify: TAB_BAR_FLOATING_INSET, TAB_DOCK_HEIGHT, TAB_DOCK_BOTTOM_BUFFER, useTabBarBottomInset, shouldHideTabBar, and dock suppression logic unchanged; no withRepeat/perpetual loop introduced)

## 5. Verification gates

- [x] 5.1 Run `cd ChatApp && npm run tsc` — must pass
- [x] 5.2 Run `cd ChatApp && npm run lint` — must pass without new warnings on touched files
- [x] 5.3 Run `cd ChatApp && npm test` — existing suites must remain green ← (verify: all three gates pass; report output honestly) — tsc + lint pass; jest 69/71 suites green; 6 failures pre-existing in `featureAvailability.spec` and `WebRTCService.call.spec` (no import path to any touched file; identical failure set before and after the batch)
- [x] 5.4 Provide user-executed device smoke checklist: light+dark personal home scroll, profile edit nav, account switch nav, language picker select/rollback, notifications toggle, logout, tab switch glow on all five tabs — checklist delivered in chat to the user
