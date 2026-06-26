## 1. Theme Foundation (palette + resolution)

- [x] 1.1 Add a `dark` color palette in `ChatApp/src/ui/theme.ts` covering every token role in `koolaColors`, using the proposed values in design.md as the starting point.
- [x] 1.2 Validate dark text tokens (`ink`, `muted`, `faint`, `primary`) meet WCAG 2.1 AA contrast against their dark background tokens (`canvas`, `surface`); adjust hex values as needed.
- [x] 1.3 Define a `ThemeMode` type (`'light' | 'dark' | 'system'`) and a `Palette` type; keep `koolaColors` exported unchanged as the light palette (back-compat).
- [x] 1.4 Add a pure `resolveMode(mode, systemScheme)` returning `'light' | 'dark'`, and a pure `normalizeMode(stored)` that maps any invalid/missing value to `'system'`. ← (verify: light/dark/system + invalid-fallback all return correct values)

## 2. Persistence

- [x] 2.1 Add a `THEME` key to the `KEYS` map and `getThemeMode`/`setThemeMode` accessors in `ChatApp/src/services/storage/asyncStorage.ts`.
- [x] 2.2 Ensure `getThemeMode` returns a normalized mode and never throws (catch read errors, log a warning, return `'system'`). ← (verify: read failure and invalid stored value both yield `system` without crashing)

## 3. Theme Provider + Hook

- [x] 3.1 Create a `ThemeProvider` (React Context) exposing `{ palette, mode, setMode }`; resolve the active palette from `mode` + `useColorScheme()` so `system` reacts live to OS changes.
- [x] 3.2 Hydrate persisted mode on mount via `getThemeMode`; use `'system'` as the initial value before hydration resolves.
- [x] 3.3 Implement `setMode` to update state and persist via `setThemeMode`.
- [x] 3.4 Create and export a `useTheme()` hook from `ChatApp/src/ui` (add to `ui/index.ts`). ← (verify: `setMode` causes consumers to re-render with the new palette; hook works pre-login)

## 4. Mount at App Root

- [x] 4.1 Mount `ThemeProvider` in `ChatApp/src/App.tsx` above `AuthProvider` (so theming works on auth screens).
- [x] 4.2 Replace the hardcoded `StatusBar` props in `App.tsx` with a small component that reads `useTheme()` and sets `barStyle`/`backgroundColor` from the active palette.
- [x] 4.3 In `ChatApp/src/navigation/RootNavigator.tsx`, derive a React Navigation theme (from `DefaultTheme`/`DarkTheme`) using the active palette and pass it to `NavigationContainer`. ← (verify: status bar + native headers follow dark mode; no light header over dark content)

## 5. Migrate Shared Primitives

- [x] 5.1 Convert `KoolaText` to `useTheme()` + `useMemo(makeStyles(palette))`; map tones to the active palette; keep props/API unchanged.
- [x] 5.2 Convert `KoolaSurface` (base/raised/soft/outline variants) to the live palette.
- [x] 5.3 Convert `KoolaButton` and `KoolaIconButton` to the live palette, preserving disabled/pressed/loading states.
- [x] 5.4 Convert `KoolaTextInput` to the live palette, preserving error/disabled/placeholder states.
- [x] 5.5 Convert `KoolaBadge`, `KoolaChip`, and `KoolaDivider` to the live palette.
- [x] 5.6 Convert `KoolaSkeleton` and `KoolaState` (loading/error/empty) to the live palette. ← (verify: every primitive recolors on mode switch; disabled/pressed/loading/error/empty/long-text states render correctly in BOTH palettes; no prop signature changed)

## 6. Settings Mode Control

- [x] 6.1 Add an inline segmented control (Sáng / Tối / Tự động) to `ChatApp/src/screens/main/SettingsScreen.tsx`, wired to `useTheme().setMode`, reflecting the current mode.
- [x] 6.2 Replace the screen's own static `koolaColors` usage with `useTheme()` so the Settings screen itself renders correctly in dark mode (including the notifications `Switch` track/thumb colors).
- [x] 6.3 Add accessibility to the segmented control: accessibility role per segment and selected-state announcement. ← (verify: tapping a segment applies instantly + persists; selected segment reflects current mode; screen reader announces the selected option)

## 7. Tests & Verification

- [x] 7.1 Unit-test `resolveMode` and `normalizeMode` (light/dark/system + invalid/missing fallback).
- [x] 7.2 Unit-test storage hydrate/persist round-trip and the read-failure fallback to `system`.
- [x] 7.3 Render-smoke each migrated primitive in both palettes (renders without error in light and dark).
- [x] 7.4 Run `npm run tsc` in `ChatApp` and confirm no new type errors; confirm unmigrated screens still compile against `koolaColors`. ← (verify: type-check passes; back-compat intact for unmigrated screens)
