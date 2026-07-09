## Purpose

Provide a system-aware dark mode theme for the mobile app, allowing users to switch between light, dark, and system-following modes with instant live recoloring of all shared UI primitives and system chrome.
## Requirements
### Requirement: Theme mode selection

The app SHALL support three theme modes — `light`, `dark`, and `system` — exposed through a single `setMode` setter. The `system` mode SHALL follow the operating system color scheme and update live when the OS scheme changes while the app is running.

#### Scenario: User selects light mode

- **WHEN** the user selects "Sáng" (light) in Settings
- **THEN** the active palette resolves to the light palette
- **AND** the choice is persisted locally

#### Scenario: User selects dark mode

- **WHEN** the user selects "Tối" (dark) in Settings
- **THEN** the active palette resolves to the dark palette
- **AND** the choice is persisted locally

#### Scenario: User selects system mode and OS is dark

- **WHEN** the user selects "Tự động" (system) and the OS color scheme is dark
- **THEN** the active palette resolves to the dark palette

#### Scenario: OS scheme changes at runtime while in system mode

- **WHEN** the mode is `system` and the OS color scheme switches from light to dark while the app is foregrounded
- **THEN** the active palette switches to dark without an app restart

### Requirement: Theme persistence and hydration

The app SHALL persist the selected mode to local storage (AsyncStorage) under a dedicated key and SHALL hydrate it on launch. On read failure or an unrecognized stored value, the app SHALL fall back to `system` mode without crashing and SHALL log a warning.

#### Scenario: Persisted mode restored on next launch

- **WHEN** the user previously selected `dark` and relaunches the app
- **THEN** the app starts in `dark` mode

#### Scenario: Storage read fails on launch

- **WHEN** reading the persisted theme mode throws an error during launch
- **THEN** the app falls back to `system` mode
- **AND** does not crash
- **AND** logs a warning

#### Scenario: Stored value is invalid or legacy

- **WHEN** the persisted theme value is missing or is not one of `light`/`dark`/`system`
- **THEN** the app treats it as `system` mode

### Requirement: Theme provider and hook at app root

The app SHALL provide a theme context mounted at the app root, above the auth provider, so theming is available before login. A `useTheme()` hook SHALL expose the active resolved palette, the current mode, and the `setMode` setter.

#### Scenario: Theme available pre-login

- **WHEN** the app renders the unauthenticated (login/register) screens
- **THEN** `useTheme()` returns a valid palette and mode

#### Scenario: setMode updates all consumers instantly

- **WHEN** `setMode` is called with a new mode
- **THEN** every component consuming `useTheme()` re-renders with the new palette without an app restart

### Requirement: Dark color palette with accessible contrast

The app SHALL define a dark color palette parallel to the existing light palette. Text color tokens in the dark palette SHALL meet WCAG 2.1 AA contrast against their intended background tokens.

#### Scenario: Dark palette covers all token roles

- **WHEN** the dark palette is defined
- **THEN** it provides a value for every token role present in the light palette (no missing keys)

#### Scenario: Dark text contrast meets AA

- **WHEN** primary and secondary text tokens are rendered on their corresponding dark background tokens
- **THEN** the contrast ratio meets WCAG 2.1 AA (≥ 4.5:1 for body text, ≥ 3:1 for large text)

### Requirement: Shared primitives are theme-aware

The shared UI primitives (`KoolaText`, `KoolaSurface`, `KoolaButton`, `KoolaIconButton`, `KoolaTextInput`, `KoolaBadge`, `KoolaChip`, `KoolaDivider`, `KoolaSkeleton`, `KoolaState`) SHALL resolve their colors from the active theme at runtime and SHALL recolor when the mode changes. Their public props and component APIs SHALL remain unchanged.

#### Scenario: Primitive recolors on mode switch

- **WHEN** the active mode changes from light to dark
- **THEN** each migrated primitive renders with the dark palette colors

#### Scenario: Primitive states preserved in both palettes

- **WHEN** a primitive is in a disabled, pressed, loading, error, empty, or long-text state
- **THEN** that state renders correctly in both the light and dark palettes

#### Scenario: Primitive API unchanged

- **WHEN** existing screens use a migrated primitive with its current props
- **THEN** the component compiles and behaves the same as before (no prop signature change)

### Requirement: System chrome follows the active theme

The status bar and the navigation container theme SHALL follow the active theme. The status bar bar-style and background SHALL match the active palette, and the React Navigation container SHALL use a matching light or dark navigation theme.

#### Scenario: Status bar matches dark theme

- **WHEN** the active palette is dark
- **THEN** the status bar uses light-content icons and a dark background appropriate to the palette

#### Scenario: Navigation chrome matches dark theme

- **WHEN** the active palette is dark
- **THEN** native navigation backgrounds/headers use the dark navigation theme

### Requirement: Theme mode control in Settings

The Settings screen (Personal tab) SHALL present an inline segmented control offering Sáng / Tối / Tự động that reflects the current mode and applies a new selection instantly. The control SHALL be accessible: it SHALL expose an appropriate accessibility role and announce which option is selected.

#### Scenario: Segmented control reflects current mode

- **WHEN** the Settings screen opens and the current mode is `dark`
- **THEN** the "Tối" segment is shown as selected

#### Scenario: Selecting a segment applies instantly

- **WHEN** the user taps a different segment
- **THEN** the app theme updates immediately
- **AND** the new mode is persisted

#### Scenario: Segmented control is accessible

- **WHEN** a screen reader inspects the control
- **THEN** each segment exposes an accessibility role and the selected segment is announced as selected

### Requirement: Backward compatibility for unmigrated screens

The existing static `koolaColors` export SHALL remain available so that screens not yet migrated to the theme hook continue to compile and render in the light palette unchanged.

#### Scenario: Unmigrated screen still renders

- **WHEN** a screen that still imports static `koolaColors` is rendered
- **THEN** it compiles and displays with light-palette colors as before

#### Scenario: Type-check passes

- **WHEN** `npm run tsc` runs in `ChatApp`
- **THEN** type-checking passes with no errors introduced by this change

### Requirement: In-scope screens consume theme via useTheme

In-scope production screens (Auth, Chat chrome, Moments, Connect, Personal) SHALL resolve their colors from `useTheme().palette` following the `SettingsScreen` reference pattern, rather than importing static `koolaColors`. Styles SHALL be produced from a palette-aware factory and sub-components that need color SHALL receive `palette`.

#### Scenario: Migrated screen recolors on mode switch

- **WHEN** the active theme mode changes from light to dark on a migrated in-scope screen
- **THEN** the screen and its sub-components render with the dark palette without an app restart

#### Scenario: Screen follows the SettingsScreen pattern

- **WHEN** an in-scope screen is migrated
- **THEN** it obtains `palette` from `useTheme()`, builds styles via a `useMemo(() => makeStyles(palette), [palette])`-style factory, and passes `palette` to color-dependent sub-components instead of importing static `koolaColors`

#### Scenario: Intentional statics are excluded from conversion

- **WHEN** a color is intentionally fixed regardless of theme — brand logo colors, media/viewer dark overlays, or faux-blur SVG gradient stops
- **THEN** it is left as an intentional static and NOT converted to a palette reference

#### Scenario: Type-check and tests pass after migration

- **WHEN** `npm run tsc` and `jest` run in `ChatApp` after a screen is migrated
- **THEN** type-checking and the existing test suite pass with no new errors introduced by the migration

