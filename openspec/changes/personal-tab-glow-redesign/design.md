## Context

The Personal home screen (`ChatApp/src/screens/main/SettingsScreen.tsx`, route `PersonalHome` in `PersonalTabStack`) is a flat list of hairline-bordered sections: centered profile block, theme selector, translation prefs, account/notifications/privacy/about/storage rows, and a danger logout button. The approved product mockup shows the same information as floating rounded cards over a soft light-field background with glow accents, a notch logo header, icon wells, and a glowing focused tab in the bottom dock. The design system already provides semantic tokens (`ChatApp/src/ui/tokens/semantic.ts`), primitive scales and glass gradients (`ChatApp/src/ui/theme.ts`), Koola primitives, `react-native-svg` gradients (used by the dock), and reanimated. The `uiux-modernization-roadmap` change governs UI batches: additive tokens allowed when a screen-level batch proves need; no new visual dependencies without approval; no BlurView reintroduction.

## Goals / Non-Goals

**Goals:**
- Recompose the Personal home into card-based soft UI with static light-field background and glow accents, light and dark.
- Preserve 100% of existing behaviors: handlers, API calls, busy/rollback states, alerts, navigation targets, language picker semantics, `__DEV__` Logo Lab row.
- Add focused-tab glow ring + outer glow to the dock for all five tabs.
- Add additive theme primitives (light-field, glow shadows, icon well, focus ring stops) with light and dark variants.

**Non-Goals:**
- Wallet/balance, points, membership tier, national ID, biometric verification, business-upgrade banner, separate "Cài đặt" pill button (no backend or mobile flow exists).
- Route changes in `PersonalTabStack`; backend/API/data-model changes; admin-web changes; new dependencies; animated (non-static) light fields.

## Decisions

### D1 — Static light-field background via react-native-svg radial gradients
A memoized `LightFieldBackground` component renders one absolutely-positioned `Svg` (pointerEvents none) behind the scroll content with the canvas base color plus radial blooms. Primitive `koolaLightField` in `theme.ts`:
- light: base `#F7F9FC`; blooms `[{#DBEAFE, 0.55, cx 50%, cy 0%, r 60%}, {#EEF4FF, 0.45, cx 15%, cy 45%, r 50%}, {#D1FAE5, 0.25, cx 90%, cy 80%, r 45%}]`
- dark: base `#0F1419`; blooms `[{#1E2A44, 0.65, cx 50%, cy 0%, r 60%}, {#1A2332, 0.50, cx 15%, cy 45%, r 50%}, {#10362B, 0.22, cx 90%, cy 80%, r 45%}]`
Alternatives: reanimated shimmer (rejected — user chose static, perf and reduced-motion safety), expo-linear-gradient dependency (rejected — roadmap rule 1.3), pure shadow-only background (rejected — cannot produce blooms).

### D2 — Card geometry and fills
Local `PersonalCard` wrapper over `KoolaSurface`: radius `koolaRadii.lg` (20), padding `koolaSpacing.lg` (16), marginHorizontal 16, marginBottom 16. Fill = `semantic.surface.level1`; dark scheme additionally applies the dark glow variant (surface tint + top hairline). Card glow primitive `koolaGlowShadows`:
- light.card: shadowColor `#2563EB`, opacity 0.10, offset {0,10}, radius 24, elevation 3
- light.header: shadowColor `#2563EB`, opacity 0.08, offset {0,6}, radius 16, elevation 2
- light.tabFocus: shadowColor `#2563EB`, opacity 0.35, offset {0,0}, radius 12, elevation 0
- dark.card: backgroundColor `#262D36`, borderTopWidth 0.5, borderTopColor `rgba(255,255,255,0.06)`, borderColor `rgba(77,141,247,0.18)`, borderWidth 1
- dark.header: backgroundColor `#222830`, borderTopWidth 0.5, borderTopColor `rgba(255,255,255,0.05)`
- dark.tabFocus: shadowColor `#4D8DF7`, opacity 0.28, offset {0,0}, radius 12, elevation 0
Alternatives: nested views for multi-shadow (rejected — RN single-shadow suffices for cards; ring glow handled by svg), BlurView (rejected — roadmap non-goal).

### D3 — Icon wells and row anatomy
`koolaIconWell = { light: '#EDF1FA', dark: '#232B36' }`. Row icons render in 36px circular wells; glyph color from `semantic.text.muted` (rows) or `semantic.action.primary` (accent rows). Quick-row and info-row components live under `ChatApp/src/screens/main/components/personal/`.

### D4 — Typography mapping (existing variants only)
- Notch header: logo only, no text.
- Profile name: `heading` (20/26/700) with weight 800, `textTransform: 'uppercase'`, numberOfLines 2.
- Profile subtitle and row titles: `body` (15/22) weight 600, tone ink; row values weight 800 where the demo emphasizes values.
- Card titles: `heading` weight 700.
- Captions/hints: `caption` tone muted; links tone primary.
No new typography variants (koola-design-tokens additive-only rule).

### D5 — Notch header
View with `borderBottomLeftRadius`/`borderBottomRightRadius` = `koolaRadii.xl` (24), fill `semantic.surface.level1`, top padding = status bar height, height 64 below status bar, centered `KoolaLogo`, header glow shadow from primitive. Sits above the ScrollView (not inside) so scroll content starts below it.

### D6 — Screen composition
Order: notch header; profile card (avatar 72 with 2px ring `semantic.border.subtle`, name, subtitle email else phone, edit hint caption, divider, "Chuyển đổi tài khoản" row with swap icon → AccountList); "Thông tin tài khoản" card (phone row if present, email row); "Cài đặt & bảo mật" card (theme segmented control row, auto-translate switch row, language row, divider group, notifications switch row, privacy row, about row, storage row); logout outlined danger pill (`KoolaButton` variant danger with pill radius override); `__DEV__` Logo Lab row kept in its own card. Language picker Modal restyled: sheet fill `semantic.surface.level1`, top radius `koolaRadii.lg`, options as icon-well rows; selection/rollback behavior untouched.

### D7 — Focused-tab glow ring in dock
In `MainNavigator.tsx` `TabBarItemComponent`, the existing `iconWell` gains an svg rounded-rect ring (stroke = linear gradient from primitive `koolaFocusGlow`) plus the tabFocus glow shadow, both driven by the existing focus `progress` shared value (opacity interpolation, bounded `withTiming`). Primitive stops:
- light: `[{#F04438, 0.9}, {#F97316, 0.9}, {#2563EB, 0.9}]`
- dark: `[{#F04438, 0.8}, {#FB923C, 0.8}, {#4D8DF7, 0.8}]`
Ring renders inside the current icon well bounds; no geometry, inset, suppression, or fullscreen-route logic touched. Alternatives: border-only ring (rejected — no multicolor gradient), per-tab hardcoded colors (rejected — token rule).

### D8 — Component extraction
New presentational components under `ChatApp/src/screens/main/components/personal/`: `LightFieldBackground.tsx`, `PersonalCard.tsx`, `PersonalIconRow.tsx`, `PersonalProfileCard.tsx`. `SettingsScreen.tsx` keeps all state/handlers and composes them. No changes to `PersonalTabStack` routes or `types.ts`.

## Risks / Trade-offs

- [Svg background repaint cost on low-end devices] → single memoized static Svg, pointerEvents none, no animated props; measured risk low because dock already renders svg gradients per frame.
- [Dark-scheme glow invisible with black shadows] → dark variants use surface tint + hairline + colored glow per D2.
- [Dock layout regression from ring] → ring drawn inside existing iconWell bounds; geometry constants (`TAB_BAR_FLOATING_INSET`, `TAB_DOCK_HEIGHT`, `useTabBarBottomInset`) untouched; verify in tasks.
- [Contrast regression on lavender wells] → wells carry icons only (non-text); all text stays on semantic text tokens (AA-validated palettes).
- [Uppercase Vietnamese names with diacritics clipping] → heading variant lineHeight 26 with numberOfLines 2 and vertical padding in card.

## Migration Plan

Single reviewable batch; no data migration. Rollback = revert the batch commit; tokens are additive so reverting leaves no dangling references outside the batch files.

## Open Questions

None. Visual smoke on physical device remains user-executed per roadmap task 8.5 precedent.
