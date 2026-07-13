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

In-scope production screens SHALL resolve their colors from `useTheme()` following the reference pattern, rather than importing static `koolaColors`. The in-scope set explicitly includes the high-traffic tier-two surfaces and shared chrome: the shared `KoolaHeader`, `ContactsScreen` (+ `ContactItem`, `ContactSearchBar`), `CallsScreen`, `UniversalSearchScreen` (+ `search/ContactResultItem`, `ConversationResultItem`, `MessageResultItem`), `QrScannerModal`, the chat reply/quote chrome (`QuoteBubble`, `ReplyPreview`, `SwipeableBubble`), `OfflineBanner`, and `LoadingFooter` — in addition to the previously-listed clusters (Auth, Chat chrome, Moments, Connect, Personal). New and re-migrated V2 styling SHALL consume semantic/component tokens via `useTheme().tokens` and build styles from a `useMemo(() => makeStyles(tokens), [tokens])` factory. The `useTheme().palette` field and the `makeStyles(palette)` pattern are RETAINED for backward compatibility with already-migrated screens, but are the legacy pattern and SHALL NOT be the target for new V2 work. Sub-components that need color SHALL receive `tokens` (or, for legacy code, `palette`).

#### Scenario: New V2 styling consumes tokens

- **WHEN** new or re-migrated V2 styling is written for an in-scope screen
- **THEN** it obtains `tokens` from `useTheme()` and builds styles via a `useMemo(() => makeStyles(tokens), [tokens])`-style factory
- **AND** it does not read colors directly from `useTheme().palette`

#### Scenario: Tier-two high-traffic surfaces render correctly in dark

- **WHEN** the shared header, Contacts, Calls, Universal Search, QR scanner, or the reply/quote chat chrome is viewed in dark mode
- **THEN** it resolves its colors from `useTheme().tokens` and reads legibly (no white bar, no dark-on-dark text)
- **AND** it recolors on a light/dark switch without an app restart

#### Scenario: Legacy palette pattern still supported

- **WHEN** an already-migrated screen continues to use `useTheme().palette` with `makeStyles(palette)`
- **THEN** it compiles and renders unchanged
- **AND** it recolors correctly on a light/dark mode switch

#### Scenario: Migrated screen recolors on mode switch

- **WHEN** the active theme mode changes from light to dark on a migrated in-scope screen
- **THEN** the screen and its sub-components render with the dark values without an app restart

#### Scenario: Intentional statics are excluded from conversion

- **WHEN** a color is intentionally fixed regardless of theme — brand logo colors, media/viewer dark overlays, or faux-blur SVG gradient stops
- **THEN** it is left as an intentional static and NOT converted to a token reference

#### Scenario: Type-check and tests pass after migration

- **WHEN** `npm run tsc` and `jest` run in `ChatApp` after a screen is migrated
- **THEN** type-checking and the existing test suite pass with no new errors introduced by the migration

### Requirement: useTheme exposes semantic tokens

The `useTheme()` hook SHALL expose a `tokens` value containing resolved `semantic` and `component` token groups, in addition to the existing `palette`, `mode`, `setMode`, and `resolvedScheme` fields. The return shape SHALL be a strict superset of the previous shape — no existing field SHALL be renamed or removed.

#### Scenario: tokens available alongside palette

- **WHEN** a component calls `useTheme()`
- **THEN** it receives `tokens.semantic` and `tokens.component` resolved for the active palette
- **AND** it still receives the existing `palette`, `mode`, `setMode`, and `resolvedScheme` fields unchanged

#### Scenario: tokens recompute on mode switch

- **WHEN** the active theme mode changes from light to dark
- **THEN** `tokens.semantic` and `tokens.component` resolve to the dark values without an app restart
- **AND** components consuming `tokens` re-render with the new values

### Requirement: Vietnamese copy and accessibility on migrated screens

Migrated in-scope screens SHALL present all user-facing copy in Vietnamese, and their migrated interactive controls SHALL carry accessibility semantics. Raw `<Text>` SHALL be replaced with `KoolaText` and `Touchable*` with `Pressable` (with press feedback) as part of migration. Interactive controls SHALL expose an `accessibilityRole` and, where the visible label is an icon or is otherwise non-descriptive, an `accessibilityLabel`; selectable/tab controls SHALL expose `accessibilityState`. The WebRTC Call screens (`CallScreen`, `IncomingCallScreen`) SHALL be migrated for text, accessibility, and color ONLY — their signaling, ICE/SDP handling, and call-lifecycle logic SHALL NOT be changed.

#### Scenario: No English copy remains on a migrated screen

- **WHEN** a migrated screen (Contacts, Calls, Call, IncomingCall, Universal Search, QR scanner) is rendered
- **THEN** all visible labels, buttons, empty/error states, and alerts are in Vietnamese
- **AND** no English user-facing string remains

#### Scenario: Call control buttons are accessible

- **WHEN** a screen reader inspects the in-call control buttons (mute, speaker, end, flip, toggle camera) or the incoming-call accept/decline buttons
- **THEN** each exposes an `accessibilityRole="button"` and a descriptive `accessibilityLabel`

#### Scenario: Call screen migration does not alter call behavior

- **WHEN** the Call screens are migrated
- **THEN** only presentational code (text, `accessibilityRole`/`accessibilityLabel`, color tokens, `KoolaText`/`Pressable`) changes
- **AND** WebRTC signaling, ICE/SDP handling, and the call-lifecycle logic are unchanged (diff shows no change to those code paths)

### Requirement: Migration reduces design-lint debt

Migrating these screens SHALL measurably reduce the design-lint audit counts (`npm run ui:audit`: `koolaColors`, `rawText`, `touchable`, `hardcodedHex`) relative to the pre-change baseline, with no regression. Where a directory becomes fully clean for a specific design-lint rule, that rule SHALL be escalated to `error` for that directory per the established ratchet; no new rule SHALL be flipped to `error` project-wide.

#### Scenario: Audit counts drop after migration

- **WHEN** `npm run ui:audit` runs after this change
- **THEN** the `koolaColors`, `rawText`, `touchable`, and `hardcodedHex` counts are lower than the recorded baseline (14 / 27 / 34 / 38)
- **AND** no previously-clean file regresses

#### Scenario: Cleaned directory escalates its rule to error

- **WHEN** a directory becomes fully clean for a specific design-lint rule after migration
- **THEN** that rule is set to `error` for that directory
- **AND** no new rule is set to `error` project-wide

