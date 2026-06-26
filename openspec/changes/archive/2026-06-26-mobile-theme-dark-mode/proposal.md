## Why

The mobile app ships only a single light color palette (`koolaColors` in `ChatApp/src/ui/theme.ts`), and those tokens are consumed inside module-level `StyleSheet.create({...})` calls across 508 usages in 53 files — meaning colors are frozen at import time and cannot react to a runtime theme switch. Users have no way to choose a dark appearance, and there is no foundation (provider, hook, or dark token set) for one. This change builds that foundation so dark mode works immediately for shared primitives and so all future UI work can opt into theme-awareness instead of accumulating more static-color debt.

## What Changes

- Add a **dark color palette** alongside the existing light palette, with WCAG 2.1 AA contrast for text tokens.
- Add a **ThemeProvider** + **`useTheme()`** hook mounted at the app root (above `AuthProvider`, so theming works pre-login). It exposes the active resolved palette, the current mode, and a `setMode` setter.
- Support three modes: `'light'`, `'dark'`, `'system'` (system follows the OS via `useColorScheme` and reacts live to OS changes).
- **Persist the chosen mode locally** in AsyncStorage (new `THEME` key); hydrate on launch; fall back to `'system'` on read failure or invalid stored value.
- Migrate **only the shared UI primitives** (`KoolaText`, `KoolaSurface`, `KoolaButton`, `KoolaIconButton`, `KoolaTextInput`, `KoolaBadge`, `KoolaChip`, `KoolaDivider`, `KoolaSkeleton`, `KoolaState`) from static `StyleSheet.create` to a `useTheme()` + `useMemo(makeStyles)` pattern so they recolor at runtime. Public props/API stay unchanged.
- Make the **StatusBar** (`App.tsx`) and the **NavigationContainer** theme follow the active mode.
- Add an inline **segmented control** (Sáng / Tối / Tự động) in `SettingsScreen` (Personal tab) wired to `setMode`, applying instantly.
- Keep the existing `koolaColors` export working so the ~53 not-yet-migrated files compile and render in light mode unchanged — **no big-bang migration**.

## Capabilities

### New Capabilities
- `mobile-theme-system`: Runtime light/dark/system theme support for the React Native app — dark palette, theme provider/hook, mode persistence, primitive theme-awareness, and the Settings mode control.

### Modified Capabilities
<!-- None. The existing token system lives in the `mobile-ui-system` change (not yet an archived spec capability); this change introduces theming as a new capability rather than altering an existing spec's requirements. -->

## Impact

- **New code**: dark palette + theme context/hook in `ChatApp/src/ui/` (e.g. `ChatApp/src/ui/theme.ts`, a new `ThemeProvider`/`useTheme` module); new `THEME` key + accessors in `ChatApp/src/services/storage/asyncStorage.ts`.
- **Modified mobile code**: the 10 shared primitives in `ChatApp/src/ui/`; `ChatApp/src/App.tsx` (mount provider, reactive StatusBar); `ChatApp/src/navigation/RootNavigator.tsx` (NavigationContainer theme); `ChatApp/src/screens/main/SettingsScreen.tsx` (segmented mode control).
- **Back-compat**: `koolaColors` static export preserved; unmigrated screens keep rendering in light mode.
- **Out of scope this round**: backend `user.settings.theme` schema/DTO/service (deferred to avoid colliding with parallel backend work); migrating the remaining ~43 screens/components (done incrementally later); chat/webrtc/offline-queue/call/media internals; NativeWind `dark:` className rewrite.
- **Dependencies**: no new npm packages — uses RN built-in `useColorScheme`/`Appearance`, existing AsyncStorage, existing React Navigation theme API.
- **Validation**: `npm run tsc` in `ChatApp`.
