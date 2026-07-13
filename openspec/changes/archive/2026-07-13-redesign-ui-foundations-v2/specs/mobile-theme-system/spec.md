## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: In-scope screens consume theme via useTheme

In-scope production screens (Auth, Chat chrome, Moments, Connect, Personal) SHALL resolve their colors from `useTheme()` following the reference pattern, rather than importing static `koolaColors`. New and re-migrated V2 styling SHALL consume semantic/component tokens via `useTheme().tokens` and build styles from a `useMemo(() => makeStyles(tokens), [tokens])` factory. The `useTheme().palette` field and the `makeStyles(palette)` pattern are RETAINED for backward compatibility with already-migrated screens, but are the legacy pattern and SHALL NOT be the target for new V2 work. Sub-components that need color SHALL receive `tokens` (or, for legacy code, `palette`).

#### Scenario: New V2 styling consumes tokens

- **WHEN** new or re-migrated V2 styling is written for an in-scope screen
- **THEN** it obtains `tokens` from `useTheme()` and builds styles via a `useMemo(() => makeStyles(tokens), [tokens])`-style factory
- **AND** it does not read colors directly from `useTheme().palette`

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
