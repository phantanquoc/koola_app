# koola-design-tokens Specification

## Purpose
TBD - created by archiving change koola-2026-redesign. Update Purpose after archive.
## Requirements
### Requirement: Additive-only token evolution

The design token layer SHALL be extended additively. New token roles and scales MAY be added, but existing token VALUES (existing `koolaColors` keys, `koolaSpacing` steps, `koolaRadii` steps, `koolaTypography` variant sizes/weights) SHALL NOT be rescaled or renamed as part of this change.

#### Scenario: New token added without changing existing values

- **WHEN** a new token (e.g., a shadow scale step or a spacing step) is added to the theme
- **THEN** all pre-existing token values remain byte-for-byte unchanged
- **AND** existing call sites referencing those tokens render identically

#### Scenario: Rescale attempt is rejected

- **WHEN** a change would alter an existing token value (e.g., `koolaRadii.md` from 14 to 12) or rename an existing typography variant
- **THEN** it SHALL be treated as out of scope for this change

### Requirement: Motion tokens

The theme SHALL provide motion tokens covering animation durations, easing curves, and spring configurations, so screens reference named motion tokens instead of hardcoded numbers.

#### Scenario: Duration tokens available

- **WHEN** a component animates a micro-interaction or a navigation/modal transition
- **THEN** it references a named duration token (e.g., fast ≈120ms, normal ≈180ms, slow ≈260–300ms) rather than a hardcoded literal

#### Scenario: Spring restricted to direct manipulation

- **WHEN** a spring animation is used
- **THEN** it SHALL be applied only to direct-manipulation gestures (image zoom/pan/drag)
- **AND** decorative spring/bounce on chrome elements SHALL NOT be introduced

#### Scenario: No perpetual loops

- **WHEN** motion is added
- **THEN** no perpetual (`withRepeat(-1)`) reanimated loop SHALL be introduced
- **AND** the existing tab-dock loops that are gated dead behind `DIAG_STATIC_TABDOCK` remain gated dead

### Requirement: Depth and shadow scale

The theme SHALL provide a shadow scale (at least `xs`, `sm`, `md`, `lg`, `xl`) that resolves per active palette, so dark-mode elevation reads correctly.

#### Scenario: Shadow scale exposes multiple levels

- **WHEN** a surface needs elevation
- **THEN** it selects a named shadow level from the scale rather than composing raw shadow properties inline

#### Scenario: Dark-mode elevation via surface, not black

- **WHEN** the active palette is dark
- **THEN** elevation is expressed via a lighter elevated surface (and optional light hairline) rather than a black drop shadow that would be invisible on a dark background

### Requirement: Additive layout and typography tokens

The theme SHALL add `zIndex` tokens, `opacity` tokens (at least disabled and pressed), additional spacing steps (40 and 48) on the existing 8px grid, additional radius steps (`xs2` = 4, `xl` = 24), and a `display` typography variant for hero text — all additive.

#### Scenario: zIndex and opacity tokens replace magic numbers

- **WHEN** a component sets stacking order or a disabled/pressed opacity
- **THEN** it references a `zIndex` or `opacity` token rather than a hardcoded number

#### Scenario: New spacing preserves the 8px grid

- **WHEN** spacing steps 40 and 48 are added
- **THEN** the 8px grid is preserved and half-step values such as 2 or 6 are NOT introduced

#### Scenario: Display variant added without renaming existing variants

- **WHEN** the `display` typography variant is added for heros
- **THEN** the existing five variants (`title`, `heading`, `body`, `label`, `caption`) keep their names, sizes, and weights

### Requirement: Design-lint governance ratchet

The project SHALL add a design-lint rule that flags magic-number spacing/radius and raw hex color literals, applied as a ratchet: `warn` globally, escalating to `error` per directory as that directory is migrated and cleaned.

#### Scenario: Lint warns on hardcoded design values

- **WHEN** code introduces a raw hex color literal or a magic-number spacing/radius in a screen or primitive
- **THEN** the design-lint rule reports it (at least at `warn`)

#### Scenario: Cleaned directory escalates to error

- **WHEN** a directory (e.g., `src/ui`) has been fully migrated to tokens
- **THEN** the design-lint rule SHALL be set to `error` for that directory so regressions fail the lint

