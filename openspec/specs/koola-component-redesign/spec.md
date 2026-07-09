# koola-component-redesign Specification

## Purpose
TBD - created by archiving change koola-2026-redesign. Update Purpose after archive.
## Requirements
### Requirement: 2026 depth application on production surfaces

In-scope production surfaces SHALL apply layered depth using the shadow scale and elevated surfaces so cards, sheets, headers, and floating elements read as distinct layers rather than flat fills, in both light and dark palettes.

#### Scenario: Card and header gain depth

- **WHEN** a card, header, or floating dock is rendered on a redesigned surface
- **THEN** it uses a named shadow level (or elevated surface in dark mode) so it visually separates from the background

#### Scenario: Depth consistent across palettes

- **WHEN** the same redesigned surface is viewed in light and in dark mode
- **THEN** elevation reads correctly in both (dark elevation via lighter surface, not an invisible black shadow)

### Requirement: Chat tab active indicator

The chat home tab bar SHALL present a clear active-tab indicator (e.g., an indicator pill or equivalent spatial affordance) in addition to color, so the active tab is distinguishable without relying on color alone.

#### Scenario: Active tab is spatially indicated

- **WHEN** a tab is active in the chat home tab bar
- **THEN** an indicator beyond icon color (e.g., a pill/background) marks it as active

#### Scenario: Indicator is accessible

- **WHEN** a screen reader inspects the tab bar
- **THEN** the active tab exposes a selected accessibility state

### Requirement: Moments gradient ring

The Moments ring SHALL render an unseen story with a gradient stroke drawn via the existing `react-native-svg` dependency, replacing the flat single-color border. Seen stories SHALL render with a muted stroke. No new gradient library SHALL be added.

#### Scenario: Unseen ring shows gradient

- **WHEN** a friend has an unseen story
- **THEN** the ring renders a multi-stop gradient stroke via `react-native-svg`

#### Scenario: Seen ring is muted

- **WHEN** a story has been seen
- **THEN** the ring renders a muted (non-gradient) stroke

#### Scenario: No new gradient dependency

- **WHEN** the gradient ring is implemented
- **THEN** it uses `react-native-svg` (already installed) and does not add `react-native-linear-gradient` or another gradient package

### Requirement: Chat bubble depth and grouping within gifted-chat

Chat message bubbles SHALL gain depth, consecutive-message grouping/tail treatment, and a delivery/read-tick visual, implemented entirely within `gifted-chat` render callbacks (`renderBubble`/`renderCustomView`). The `gifted-chat` internals, its `FlatList` performance tuning, and `freezeOnBlur` SHALL NOT be modified.

#### Scenario: Grouped bubbles render a tail

- **WHEN** consecutive messages come from the same sender
- **THEN** grouping/tail treatment is applied via the render callback

#### Scenario: Read-tick reuses existing data

- **WHEN** a sent message's delivery/read state is available from the existing read-receipt data
- **THEN** the bubble renders a corresponding tick visual without inventing new message-transport state

#### Scenario: Library internals untouched

- **WHEN** the bubble redesign is implemented
- **THEN** `gifted-chat` internals, `listViewProps` tuning (`removeClippedSubviews:false`, `maxToRenderPerBatch:5`, `windowSize:7`, `updateCellsBatchingPeriod:100`), and `freezeOnBlur` remain unchanged

### Requirement: Auth screen modernization

Auth screens SHALL be modernized: Vietnamese copy SHALL use consistent, correct diacritics across all auth screens; the OTP entry SHALL use modern per-digit boxes instead of a single raw letter-spaced `TextInput`; and field errors SHALL be shown inline rather than only through Alert dialogs.

#### Scenario: Consistent diacritics

- **WHEN** any auth screen renders Vietnamese copy
- **THEN** it uses correct diacritics consistently across Login, Register, OTP verify, Forgot, and Reset screens

#### Scenario: OTP digit boxes

- **WHEN** a user enters an OTP code
- **THEN** the input presents discrete per-digit boxes with clear filled/empty state

#### Scenario: Inline validation

- **WHEN** a field-level validation error occurs
- **THEN** the error is shown inline near the field rather than only via an Alert dialog

### Requirement: Connect real imagery

Connect discovery and business profile surfaces SHALL support real logo/avatar imagery with richer card layouts, falling back gracefully when no image is available, instead of always showing a generic icon-in-colored-square.

#### Scenario: Business with image shows it

- **WHEN** a business or profile has an available logo/avatar
- **THEN** the card/profile displays the real image

#### Scenario: Graceful fallback

- **WHEN** no image is available
- **THEN** a designed fallback (initials/placeholder) is shown rather than a broken image

### Requirement: Redesign preserves behavior and Fabric safety lines

The component redesign SHALL be visual/presentational and SHALL NOT change navigation route contracts, message transport, media pipeline behavior, or reintroduce `BlurView`. The brand mark (tri-arc ring) SHALL remain flat (no gradient/shadow); only the wordmark may be dimensional.

#### Scenario: No BlurView reintroduced

- **WHEN** a translucent/glass surface is redesigned
- **THEN** it uses the faux-blur SVG technique and does NOT add `BlurView`

#### Scenario: Brand mark stays flat

- **WHEN** the logo is rendered anywhere in the redesign
- **THEN** the tri-arc mark remains flat geometric SVG with no gradient or shadow

#### Scenario: Behavior preserved

- **WHEN** a screen is redesigned
- **THEN** its navigation, service calls, and data behavior are unchanged (visual/presentational changes only)

### Requirement: Incremental revert-safe redesign batches

The redesign SHALL be delivered in incremental batches, each declaring scope, non-scope, risk, changed files, and a verification step, and pausing for review before the next user-visible batch. A batch SHALL be revertible without reverting other clusters or the token foundation.

#### Scenario: Batch declares scope and verification

- **WHEN** a redesign batch begins
- **THEN** it declares the files/cluster in scope, what it will not change, its risk level, and how it will be verified (`tsc` + `jest`, plus any manual device checks)

#### Scenario: Batch pauses for review

- **WHEN** a batch that changes a user-visible surface finishes
- **THEN** it reports changed files and verification results and pauses before the next user-visible batch

#### Scenario: Independent revert

- **WHEN** a single cluster batch regresses
- **THEN** it can be reverted without reverting other clusters or the additive token foundation

### Requirement: Variant-aware font scaling caps

Text SHALL apply variant-aware `maxFontSizeMultiplier` caps that protect layout without disabling accessibility scaling. A global cap of `1.0` (scaling disabled) SHALL NOT be used for content text.

#### Scenario: Content scales generously

- **WHEN** content text (e.g., message body) is rendered
- **THEN** it allows generous scaling (≈1.5) or remains uncapped

#### Scenario: Chrome caps to protect layout

- **WHEN** chrome text (e.g., caption/label in tight layouts) is rendered
- **THEN** it caps at ≈1.3 rather than 1.0

#### Scenario: Layout survives 1.3x

- **WHEN** a redesigned screen is viewed at 1.3× font scale
- **THEN** its layout remains usable (no clipped or overlapping critical content)

