## ADDED Requirements

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
