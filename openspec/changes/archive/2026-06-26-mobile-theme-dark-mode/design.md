## Context

The React Native 0.76 app (`ChatApp/`) has a single light token palette `koolaColors` in `ChatApp/src/ui/theme.ts`. Those tokens are read inside module-level `StyleSheet.create({...})` blocks — 508 usages across 53 files. Because `StyleSheet.create` runs once at module import, the colors are frozen and cannot react to a runtime theme change. There is no theme provider, no dark palette, and no use of RN's `useColorScheme`/`Appearance`. NativeWind v4 + Tailwind 3.4 are configured, but screens style with `StyleSheet`, not `className`, so a `dark:` className strategy would not reach existing code.

A parallel agent is working on the backend, so this round is **mobile-only** and **local-persistence-only** to avoid collisions. Work happens in an isolated git worktree.

The goal is a foundation that makes dark mode real for shared primitives now, sets the convention for all future UI work, and avoids a risky big-bang migration of 53 files while the UI is still actively changing.

## Goals / Non-Goals

**Goals:**

- Add a dark palette with WCAG 2.1 AA text contrast, parallel to the light palette.
- Add a `ThemeProvider` + `useTheme()` hook at the app root (above `AuthProvider`), exposing `{ palette, mode, setMode }`.
- Support `light` / `dark` / `system` modes; `system` resolves live via `useColorScheme`.
- Persist mode to AsyncStorage; hydrate on launch; fall back to `system` on failure/invalid.
- Migrate the 10 shared primitives to a `useTheme()` + `useMemo(makeStyles)` reactive-styles pattern, keeping their public APIs identical.
- Make StatusBar and NavigationContainer theme follow the active palette.
- Add an inline segmented Sáng/Tối/Tự động control in `SettingsScreen`.
- Keep `koolaColors` exported and unchanged so unmigrated screens still compile and render in light mode.
- Document a repeatable conversion recipe for migrating screens incrementally later.

**Non-Goals:**

- Backend `user.settings.theme` schema/DTO/service changes (deferred follow-up; avoids parallel-agent collision).
- Migrating the remaining ~43 screens/components (incremental, later, via the documented recipe).
- Touching chat gateway, WebRTC, OfflineQueueService, call screen internals, or media pipeline.
- Rewriting styling to NativeWind `dark:` className variants.
- Adding new npm dependencies.

## Decisions

### 1. React Context provider + `useTheme()` hook (not a global store)

- **Choice**: A `ThemeProvider` using React Context, mounted at the app root above `AuthProvider`, exposing `{ palette, mode, setMode }`.
- **Rationale**: Matches the app's existing pattern (`AuthProvider` is a root Context). No new dependency. Context change triggers re-render of consumers, which is exactly what runtime theming needs.
- **Alternatives considered**: Zustand/Redux store — rejected, adds a dependency and a second state paradigm for a small concern. Module-level mutable singleton — rejected, would not trigger React re-renders reliably.

### 2. Reactive styles via `useTheme()` + `useMemo(makeStyles(palette))`

- **Choice**: Convert each primitive's module-level `StyleSheet.create({...})` into a `makeStyles(palette)` factory called inside the component via `const styles = useMemo(() => makeStyles(palette), [palette])`.
- **Rationale**: This is the documented RN pattern for runtime theming. `useMemo` keyed on `palette` keeps `StyleSheet.create` benefits (caching) while recomputing only when the palette object identity changes. Color-only style keys move into `makeStyles`; layout-only keys can stay static if preferred, but keeping them together is simpler and the cost is negligible for small primitives.
- **Alternatives considered**: Inline style objects per render — rejected, loses `StyleSheet` optimization and is noisier. NativeWind `dark:` — rejected, primitives use `StyleSheet`.

### 3. Mode resolution is pure and isolated

- **Choice**: A small pure function resolves `(mode, systemScheme) -> 'light' | 'dark'`, and a pure normalizer maps any stored string to a valid mode (`light`/`dark`/`system`, else `system`). The provider wires these to `useColorScheme()` and AsyncStorage.
- **Rationale**: Pure resolution/normalization is trivially unit-testable (covers light/dark/system + invalid fallback) without mounting React or mocking native modules.
- **Alternatives considered**: Resolving inline inside the provider effect — rejected, harder to test the fallback/invalid paths in isolation.

### 4. Persistence: AsyncStorage key, hydrate-then-render

- **Choice**: Add a `THEME` entry to the `KEYS` map in `ChatApp/src/services/storage/asyncStorage.ts` with `getThemeMode`/`setThemeMode` accessors. The provider hydrates on mount; until hydrated it uses `system` as the initial value (no blocking splash needed — `system` already gives a sensible OS-matched default, so there is no light/dark flash for users whose stored choice equals their OS).
- **Rationale**: Mirrors existing storage accessors. `system`-as-initial avoids an extra gate while keeping the hydrate path simple. A persisted `light`/`dark` choice applies as soon as hydration resolves (one frame), acceptable for a color swap.
- **Alternatives considered**: Blocking render behind a hydration gate — rejected as unnecessary for a non-destructive color swap; adds splash complexity.

### 5. NavigationContainer + StatusBar follow the palette

- **Choice**: Derive a React Navigation theme object (based on `DefaultTheme`/`DarkTheme`) from the active palette and pass it to `NavigationContainer`. Move the hardcoded `StatusBar` props in `App.tsx` into a small component that reads `useTheme()`.
- **Rationale**: Native headers and the gap behind translucent bars otherwise stay light. Android `styles.xml` already uses `Theme.AppCompat.DayNight`, so the native side cooperates.
- **Alternatives considered**: Leaving navigation light — rejected, produces a jarring light header over dark content.

### 6. Back-compat: keep `koolaColors` as the light palette export

- **Choice**: `koolaColors` continues to export the light palette unchanged. The dark palette is a new sibling export; the resolved active palette comes only from `useTheme()`.
- **Rationale**: Zero churn for the ~43 unmigrated screens; they keep compiling and rendering in light. Migration becomes opt-in per screen via the recipe below.
- **Alternatives considered**: Replacing `koolaColors` with a dynamic getter — rejected, it cannot be reactive at module scope and would silently break the frozen-at-import call sites.

### Proposed dark palette (for user review)

Seeded from the dark-mode hints in `edit-profile-redesign/design.md`, then completed for every token role in `koolaColors`. Values are a proposal; finalize during implementation against WCAG AA.

| Token | Light | Proposed Dark | Notes |
|-------|-------|---------------|-------|
| ink (primary text) | `#101828` | `#F2F4F7` | Inverted; AA on canvas/surface |
| muted (secondary text) | `#667085` | `#A0AAB8` | AA on dark surface |
| faint (placeholder/disabled) | `#98A2B3` | `#6C7686` | Lower emphasis, still legible |
| line (borders/dividers) | `#E4E7EC` | `#2F3542` | Subtle separator on dark |
| canvas (page bg) | `#F7F9FC` | `#0F1419` | Deep base |
| surface (cards/modals) | `#FFFFFF` | `#1C2026` | Elevated above canvas |
| primary (actions/links) | `#2563EB` | `#3B82F6` | Lightened for contrast on dark |
| primaryDark (pressed) | `#1D4ED8` | `#2563EB` | One step down from primary |
| primarySoft (tint bg) | `#DBEAFE` | `#1E2A44` | Dark-tinted primary fill |
| accent | `#10B981` | `#34D399` | Lightened |
| accentSoft | `#D1FAE5` | `#10362B` | Dark accent fill |
| warm | `#F97316` | `#FB923C` | Lightened |
| danger | `#EF4444` | `#F87171` | Lightened for dark bg |
| dangerSoft | `#FEE2E2` | `#3B1D1D` | Dark danger fill |
| warning | `#F59E0B` | `#FBBF24` | Lightened |
| warningSoft | `#FEF3C7` | `#3A2E12` | Dark warning fill |
| warningInk | `#B45309` | `#FCD34D` | Readable warning text on dark |
| success | `#12B76A` | `#3DD68C` | Lightened |
| successSoft | `#DCFCE7` | `#10362B` | Dark success fill |
| skeleton | `#EEF2F7` | `#252B33` | Loading shimmer base on dark |

`koolaShadows` use `shadowColor: '#101828'`; on dark, shadows read weakly — acceptable for Phase 1 (elevation via `surface` vs `canvas` contrast carries the hierarchy). Shadow tuning is a later polish item, not a blocker.

### Conversion recipe (for incremental screen migration later)

To migrate a screen from static `koolaColors` to the live theme:

1. `import { useTheme } from '../../ui';` and inside the component: `const { palette } = useTheme();`
2. Replace `const styles = StyleSheet.create({ ... koolaColors.X ... })` (module scope) with a factory: `const makeStyles = (c: Palette) => StyleSheet.create({ ... c.X ... })` (module scope), then inside the component: `const styles = useMemo(() => makeStyles(palette), [palette]);`
3. For inline color props (e.g. `<MaterialIcons color={koolaColors.muted} />`), swap to `palette.muted`.
4. Replace stray hardcoded hex (e.g. the `Switch` `trackColor`/`thumbColor` in `SettingsScreen`, the `LOGO_COLORS` array in `BusinessProfileScreen`) with palette tokens where a token exists; leave brand-fixed hex as-is if intentionally constant.
5. Run `npm run tsc`; smoke the screen in both light and dark.

Estimated ~30s–few minutes per screen depending on size. This is the convention all new UI work should follow so dark support accrues automatically.

## Risks / Trade-offs

- **Transitional inconsistency**: unmigrated screens stay light while primitives/migrated screens go dark → Mitigation: primitives cover most surfaces; recipe makes per-screen migration fast; this is an accepted, visible-but-non-breaking interim state.
- **`useMemo` dependency correctness**: if a primitive forgets `[palette]` deps, it won't recolor → Mitigation: consistent pattern across all 10 primitives; render-smoke in both palettes during implementation.
- **Hydration flash for explicit light/dark choosers whose OS differs**: one-frame swap from `system`-default to stored value → Mitigation: accepted (single color frame, non-destructive). A hydration gate is available later if user reports it.
- **WCAG AA on proposed dark values**: proposed table is unvalidated until implementation → Mitigation: validate contrast during implementation; adjust token values before finalizing.
- **Parallel backend agent collision**: avoided entirely by deferring all backend work and isolating in a worktree.
- **Stale Tailwind tokens**: `tailwind.config.js` still holds only light tokens; since the app styles via `StyleSheet`, this does not affect Phase 1 → Mitigation: out of scope; revisit only if/when `className` theming is adopted.

## Migration Plan

1. Land Phase 1 in the worktree (provider, dark palette, primitives, StatusBar/Navigation, Settings control, storage key, tests).
2. Verify `npm run tsc` and primitive render-smoke in both palettes.
3. Merge after the parallel backend agent completes (no backend overlap, so merge is mobile-file-only).
4. Follow-up (separate change): backend `user.settings.theme` sync; incremental screen migration using the recipe.

**Rollback**: revert is low-risk — primitives keep identical APIs and `koolaColors` is untouched, so reverting the provider mount + primitive diffs returns the app to light-only with no data migration to undo.

## Open Questions

- Final dark token hex values pending WCAG AA validation during implementation (proposed table above is the starting point).
- Whether to tune `koolaShadows` for dark now or defer — current plan defers (rely on surface/canvas contrast).
