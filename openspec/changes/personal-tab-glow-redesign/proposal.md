## Why

The Personal tab ("Cá nhân", `PersonalTabStack` → `PersonalHome` = `SettingsScreen.tsx`) is a flat hairline-bordered settings list that visually lags the rest of the app and the product mockup the user approved: soft rounded cards floating on a light-field background with glow accents. The user requested a modern, simple redesign of this tab with light/glow imagery, adjusted typography and layout, matching the provided demo mockup.

## What Changes

- Rebuild the Personal home screen layout from flat sections into floating rounded cards on a soft light-field background (static radial/linear gradient blooms + layered glow shadows), for both light and dark schemes.
- Add a compact notch-style header carrying the existing `KoolaLogo` at the top of the Personal home screen.
- Recompose the profile header into a horizontal profile card: avatar with ring, display name, email/phone subtitle, edit affordance to `EditProfile`, and a "Chuyển đổi tài khoản" row navigating to the existing `AccountList` screen.
- Add an "Thông tin tài khoản" card listing the authenticated user's phone and email as icon rows; rows whose data is absent are hidden.
- Group all existing settings entries (theme mode, auto-translate + preferred language, notifications, privacy, about, cache/storage) into a single "Cài đặt & bảo mật" card, preserving every existing behavior, API call, busy state, error alert, and the language picker (restyled to the card visual language).
- Restyle the logout action as a demo-style outlined danger pill button.
- Add a focused-tab glow treatment (gradient ring + soft outer glow) to the floating bottom dock, applied consistently to all five tabs, derived from theme tokens.
- Add additive glow/light-field primitives (gradient stops, glow shadow stacks, icon-well tokens) to `ChatApp/src/ui/theme.ts` with light and dark variants; existing token values remain unchanged.
- Explicit non-goals: no wallet/balance, points, membership tier, national ID, biometric verification, business-upgrade banner, or separate "Cài đặt" pill button (no backend or mobile flow exists for them); no route changes in `PersonalTabStack`; no backend, API, or data-model changes; no new dependencies.

## Capabilities

### New Capabilities
- `personal-home-presentation`: Covers the Personal home screen card-based layout, light-field background, profile/info/settings card composition, preserved settings behaviors, edge-case presentation (missing phone/email, long names, missing avatar), and accessibility/contrast expectations.

### Modified Capabilities
- `koola-design-tokens`: Adds requirements for additive glow/light-field primitives (background light-field stops, glow shadow stacks, icon-well surfaces) with mandatory light and dark variants, without altering any existing token value.
- `mobile-navigation-shell`: Adds a requirement for the focused primary-tab glow treatment (gradient ring + outer glow) on the floating dock, token-derived for both schemes, without changing safe-area allocation, dock suppression, or fullscreen-route behavior.

## Impact

- `ChatApp/src/screens/main/SettingsScreen.tsx` — layout recomposition into cards; all handlers/state/navigation targets preserved.
- New presentational components under `ChatApp/src/screens/main/components/personal/` (profile card, info card, settings card, light-field background).
- `ChatApp/src/ui/theme.ts` — additive glow/light-field primitives (light + dark).
- `ChatApp/src/navigation/MainNavigator.tsx` — focused-tab glow ring/outer glow in the custom tab bar; tab geometry, suppression, and insets unchanged.
- No backend, Socket.IO, database, admin-web, or dependency changes.
- Verification gates: `cd ChatApp && npm run tsc`, `npm run lint`, `npm test`; visual smoke on device remains user-executed per `uiux-modernization-roadmap` task 8.5 precedent.
