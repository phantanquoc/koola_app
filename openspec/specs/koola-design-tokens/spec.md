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

### Requirement: Three-tier semantic token architecture

The design token layer SHALL provide a three-tier architecture — primitive → semantic → component — layered additively over the existing flat token exports. The existing exports (`koolaColors`, `koolaDarkColors`, `koolaSpacing`, `koolaRadii`, `koolaTypography`, `koolaShadows`, `koolaDarkShadows`, `koolaZIndex`, `koolaOpacity`) SHALL remain byte-for-byte unchanged and continue to be exported for back-compat. Semantic color tokens SHALL be produced by a `makeSemanticTokens(palette, surfaces)` factory so a single semantic name yields the correct value for whichever palette is active. Semantic tokens SHALL be consumed via `useTheme().tokens` (not raw `palette`).

The locked v1 semantic token names are: `bg.canvas`; `surface.level0/level1/level2/overlay`; `text.primary/muted/faint/onAction`; `action.primary/primaryPressed/primarySoft`; `signal.selected/unread`; `status.success/warning/danger`; `border.subtle/strong`; `focus.ring`; `link`; `brand.red/blue/green`. Names MAY be added additively later but SHALL NOT be renamed without a spec change.

#### Scenario: Semantic tokens layered without altering primitives

- **WHEN** the semantic and component token tiers are added
- **THEN** every existing flat token export (values and names) remains unchanged
- **AND** existing call sites that read `koolaColors`/`koolaSpacing`/`koolaRadii`/etc. render identically

#### Scenario: Semantic token resolves per active palette

- **WHEN** a component reads a semantic token (e.g. `text.primary`, `bg.canvas`, `action.primary`, `border.subtle`) through `useTheme().tokens`
- **THEN** it receives the light value under the light palette and the dark value under the dark palette
- **AND** no component needs to branch on `resolvedScheme` to pick a color

#### Scenario: Component color tokens compose from semantics; layout may use primitives

- **WHEN** a component token is defined
- **THEN** its color/surface fields (e.g. `chatBubble.own.bg`, `tab.active`, `composer.surface`) are composed from semantic COLOR tokens (never raw hex or primitive color literals)
- **AND** its layout/motion fields MAY reference the existing primitive spacing/radius/typography/motion scales
- **AND** changing a semantic color token propagates to every component color token built on it

#### Scenario: Glass chrome tokens use the locked GlassSurface shape

- **WHEN** a chrome/overlay component token opts into a glass treatment (`tab.dock`, `composer.surface`, `sheet.surface`)
- **THEN** it conforms to the locked `GlassSurface` shape `{ fill, tint, sheen, hairline, bottomLine }` (resolved colors/alphas composed from semantic tokens, no `BlurView`)
- **AND** the shape is identical across all glass chrome tokens so consumers can rely on it

### Requirement: Surface-level elevation scale sourced from a SurfaceScale primitive

The token layer SHALL add an additive `SurfaceScale` primitive — `type SurfaceScale = { level0: string; level1: string; level2: string; overlay: string }` with `koolaLightSurfaces` and `koolaDarkSurfaces` constants — as the color source for semantic `surface.*` tokens. Semantic surface levels SHALL be named `surface.level0`, `surface.level1`, `surface.level2`, and `surface.overlay` (numeric-suffix names such as `surface.1` SHALL NOT be used). Elevation SHALL be expressed through progressively lighter/tinted surface colors rather than heavy drop shadows, and the `Palette` type and existing palette exports SHALL NOT be modified to add these surfaces.

#### Scenario: Surface levels have a defined color source

- **WHEN** a semantic `surface.level1`/`surface.level2` token is resolved
- **THEN** its value comes from the `SurfaceScale` primitive (`koolaLightSurfaces`/`koolaDarkSurfaces`) for the active palette
- **AND** no runtime color-mixing and no reuse of `line` as a background is required

#### Scenario: Palette type unchanged by surfaces

- **WHEN** the `SurfaceScale` primitive is added
- **THEN** the existing `Palette` type and all existing palette exports remain unchanged
- **AND** `SurfaceScale` is a separate additive primitive passed into `makeSemanticTokens`

#### Scenario: Dark-mode elevation stays visible

- **WHEN** the active palette is dark
- **THEN** each surface level resolves to a distinct tint that is visibly lighter than the level beneath it
- **AND** elevation does not rely on a black drop shadow that would be invisible on a dark background

### Requirement: Content-first token direction

The token direction SHALL be content-first: brand hue is reserved for actions, signals, status, focus, links, and the brand mark (i.e. the `action.*`, `signal.*`, `status.*`, `focus.*`, `link`, and `brand.*` token groups), while neutral background and text tokens (`bg.*`, `surface.*`, `text.*`) SHALL carry no brand hue by default. Glass/translucent treatments SHALL be reserved for chrome and overlay surfaces (navigation dock, sheets, media/story/call viewers) and SHALL NOT be layered over content. This direction SHALL be expressed through semantic/component tokens and SHALL NOT be achieved by rescaling any existing base token value.

#### Scenario: Brand hue only on branded token groups

- **WHEN** the semantic tokens are defined
- **THEN** brand hue appears only in `action.*`, `signal.*`, `status.*`, `focus.*`, `link`, and `brand.*`
- **AND** `bg.*`, `surface.*`, and `text.*` (except `text.onAction`) carry no brand hue

#### Scenario: Glass reserved for chrome

- **WHEN** a component token for a chrome/overlay surface (e.g. `tab.dock`, `sheet.surface`) opts into a glass/translucent treatment
- **THEN** no component token for a content surface (e.g. `chatBubble.*`, a list row) uses a glass/translucent treatment

#### Scenario: Direction change does not rescale base tokens

- **WHEN** the content-first direction is applied
- **THEN** it is realized by adding or re-pointing semantic/component tokens
- **AND** no existing `koolaColors`/`koolaSpacing`/`koolaRadii`/`koolaTypography` value is changed to achieve it

### Requirement: Official styling backbone

The project SHALL adopt `StyleSheet` + `useTheme()` + `makeStyles(tokens)` as the official styling backbone for production UI, where `tokens` is `useTheme().tokens`. The `makeStyles(palette)` pattern is RETAINED as a legacy pattern for already-migrated code but SHALL NOT be the target for new V2 work. New production code SHALL NOT introduce NativeWind `className` usage. NativeWind SHALL remain an installed dependency (its removal is deferred to a separate future chore) but SHALL NOT gain new production call sites.

#### Scenario: New production styling uses the tokens backbone

- **WHEN** new production styling is written
- **THEN** it uses `StyleSheet` with a `makeStyles(tokens)` factory consumed via `useTheme().tokens`
- **AND** it does not add a NativeWind `className` to a production screen

#### Scenario: NativeWind stays installed but unextended

- **WHEN** this change is complete
- **THEN** NativeWind remains listed as a dependency
- **AND** the number of primitives declaring a pass-through `className` prop does not exceed the existing count
- **AND** the number of production call sites passing `className` remains zero

### Requirement: Extended design-lint guardrails

The design-lint governance SHALL extend beyond raw hex literals, split by detection reliability. Reliable ESLint rules SHALL flag raw `<Text>` usage (allowing `KoolaText`, and exempting `src/ui/KoolaText.tsx`), `Touchable*` usage, and `koolaColors` imports inside `src/screens`/`src/components`. A heuristic ESLint rule SHALL flag magic-number spacing/radius on style keys. A cross-platform audit script (not ESLint) SHALL detect `gap` combined with `flex:1` in a row-direction container. All rules SHALL follow the ratchet model: `warn` globally, escalating to `error` only for directories already clean for that specific rule, and token-definition files (`src/ui/theme.ts`, `src/ui/tokens/**`) SHALL stay exempt. This change SHALL NOT set any new rule to `error` project-wide.

#### Scenario: New guardrails warn globally

- **WHEN** code in a not-yet-cleaned directory introduces a raw `<Text>`, a `Touchable*`, a `koolaColors` screen import, or a magic-number spacing/radius
- **THEN** the corresponding ESLint rule reports it at least at `warn`

#### Scenario: gap+flex:1 detected by audit script

- **WHEN** a row-direction container uses `gap` together with a `flex:1` child
- **THEN** the audit script reports it
- **AND** this detection is NOT implemented as a single AST selector (which cannot see the parent/child render relationship)

#### Scenario: KoolaText primitive is exempt from the raw-Text rule

- **WHEN** `src/ui/KoolaText.tsx` renders a raw React Native `<Text>` internally
- **THEN** the raw-`<Text>` rule does not flag it

#### Scenario: Clean directories escalate the new guardrails to error per rule

- **WHEN** a directory is clean for a specific guardrail
- **THEN** that guardrail SHALL be set to `error` for that directory so regressions fail lint
- **AND** the guardrail is NOT set to `error` for directories that still contain legacy offenders for that rule

#### Scenario: No project-wide error flip

- **WHEN** the extended guardrails are added
- **THEN** the global severity for the new rules remains `warn`
- **AND** builds in unmigrated directories are not broken by the new rules

