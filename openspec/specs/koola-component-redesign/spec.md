# koola-component-redesign Specification

## Purpose
TBD - created by archiving change koola-2026-redesign. Update Purpose after archive.
## Requirements
### Requirement: 2026 depth application on production surfaces

Production surfaces SHALL follow a content-first depth model: content surfaces (list rows, message bubbles, inline content) default to flat fills separated by surface levels and hairline borders, NOT drop shadows. Containment (a card) SHALL be used only when content genuinely needs to be grouped as a distinct block, and expresses elevation via a surface level, not a heavy shadow. Shadow (a light named shadow level) SHALL be reserved for floating chrome and transient surfaces — the navigation dock, menus, sheets, and modals. Dark-mode elevation SHALL always be expressed via a lighter elevated surface, never an invisible black drop shadow. Headers and cards SHALL NOT be required to carry a shadow.

#### Scenario: Content surfaces default flat

- **WHEN** a list row, message bubble, or inline content surface is rendered
- **THEN** it separates from its background using a surface level and/or a hairline border
- **AND** it does not apply a drop shadow by default

#### Scenario: Cards used only for genuine containment

- **WHEN** content needs to be grouped as a distinct block (genuine containment)
- **THEN** a card MAY be used, expressing elevation via a surface level
- **AND** a header or a plain section is NOT wrapped in a shadowed card merely for decoration

#### Scenario: Shadow reserved for floating chrome

- **WHEN** a navigation dock, menu, sheet, or modal is rendered
- **THEN** it MAY use a light named shadow level to read as a floating/transient layer

#### Scenario: Depth consistent across palettes

- **WHEN** the same surface is viewed in light and in dark mode
- **THEN** elevation reads correctly in both (dark elevation via a lighter surface, not an invisible black shadow)

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

### Requirement: Primitive accessibility and dark-mode correctness

Shared UI primitives SHALL expose correct accessibility semantics and render correctly in the dark palette. Specifically: interactive `KoolaChip` SHALL set an `accessibilityRole` and reflect selection via `accessibilityState`; `KoolaSurface`'s `raised` variant SHALL express elevation in dark mode via a lighter elevated surface (not an invisible black drop shadow); and avatars SHALL resolve their chrome colors from the active theme rather than static light-palette values.

#### Scenario: Chip announces selection to assistive tech

- **WHEN** a `KoolaChip` is rendered in a selectable context
- **THEN** it exposes an `accessibilityRole`
- **AND** its selected/unselected status is exposed via `accessibilityState` so a screen reader announces the state

#### Scenario: Raised surface reads as elevated in dark mode

- **WHEN** a `KoolaSurface` with `variant="raised"` is rendered while the active palette is dark
- **THEN** it reads as elevated via a lighter elevated surface tint (and/or a subtle light hairline)
- **AND** it does not rely on a black drop shadow that is invisible on a dark background

#### Scenario: Avatar chrome follows the active theme

- **WHEN** an avatar is rendered in dark mode
- **THEN** its border/background chrome resolves from `useTheme().tokens`
- **AND** it does not render a light-palette (white) border on a dark background

### Requirement: Theme-aware avatar primitive

The design system SHALL provide a `KoolaAvatar` primitive consuming `useTheme().tokens`, offering size presets and an optional online-indicator slot. The existing `UserAvatar` public API SHALL be preserved (as a wrapper over `KoolaAvatar` or via migrated call sites) so no consumer breaks.

#### Scenario: KoolaAvatar renders across sizes and themes

- **WHEN** `KoolaAvatar` is rendered at a given size preset in light or dark mode
- **THEN** it displays the image or an initials/fallback with theme-appropriate chrome
- **AND** an online indicator is shown only when that slot is enabled

#### Scenario: UserAvatar remains back-compatible

- **WHEN** an existing call site renders `UserAvatar` with its current props
- **THEN** it continues to compile and render unchanged in light mode
- **AND** it now also renders correctly in dark mode

### Requirement: Missing primitives with state matrix and built-in accessibility

The design system SHALL provide the following primitives, each consuming `useTheme().tokens`, shipping appropriate accessibility semantics by default, and implementing its applicable state matrix (default, pressed, focused, disabled, loading, selected where applicable, dark, and large-text): `KoolaSheet` (wrapping the installed `@gorhom/bottom-sheet`), `KoolaDialog`, `KoolaMenu`, `KoolaToast`, `KoolaSearchField`, `KoolaListItem`, `KoolaSegmentedControl`, and state presets `KoolaLoadingState` / `KoolaEmptyState` / `KoolaErrorState` / `KoolaOfflineState` built over the existing `KoolaState`. Interactive targets SHALL be at least 44x44. No `Tooltip` primitive SHALL be added in this change. No new heavy UI dependency SHALL be introduced (wrapping installed bottom-sheet and toast dependencies is permitted).

#### Scenario: Each primitive honors its state matrix

- **WHEN** a newly added primitive is placed in any state applicable to it (e.g. pressed, focused, disabled, loading, selected)
- **THEN** it renders a distinct, theme-appropriate treatment for that state in both light and dark palettes
- **AND** it remains legible and non-overflowing under large-text accessibility scaling (no `maxFontSizeMultiplier={1.0}`)
- **AND** each interactive target is at least 44x44

#### Scenario: Primitives carry accessibility roles by default

- **WHEN** an interactive primitive (`KoolaListItem` with `onPress`, `KoolaSegmentedControl`, `KoolaMenu` item, `KoolaSearchField`, dialog/sheet actions) is rendered
- **THEN** it exposes an appropriate `accessibilityRole` (and `accessibilityState` for selectable/toggle items) without the caller having to add it
- **AND** a non-interactive `KoolaListItem` does not expose button semantics or a dead tap target

#### Scenario: Sheet wraps the existing dependency

- **WHEN** `KoolaSheet` is used
- **THEN** it is implemented over the already-installed `@gorhom/bottom-sheet`
- **AND** no additional sheet/menu/toast library is added to dependencies

#### Scenario: Tooltip is not introduced

- **WHEN** this change is complete
- **THEN** no `Tooltip` primitive exists in the design system from this change

#### Scenario: Toast uses the root singleton

- **WHEN** a Koola toast is shown
- **THEN** it renders through the app-level `react-native-toast-message` singleton using token-driven content
- **AND** no screen-local toast overlay host or perpetual animation loop is created

### Requirement: Content-first V2 uplift of reference production surfaces

The three reference production surfaces — Conversation List (`ConversationListScreen` + `ConversationListItem`), Chat Room (`ChatScreen` with its `ChatComposer`/`ChatHeader` chrome), and Settings (`SettingsScreen`) — SHALL be uplifted to the V2 visual language: consuming `useTheme().tokens` via a `makeStyles(tokens)` factory, applying content-first depth (flat content surfaces separated by surface levels and hairlines; shadow/glass reserved for chrome such as the composer dock), reserving brand hue for actions/signals, and rendering correctly in light and dark and under large-text scaling. Chat bubble restyling SHALL occur strictly within `gifted-chat` render callbacks. The `gifted-chat` library, its FlatList performance tuning, and `freezeOnBlur` SHALL NOT be modified.

#### Scenario: Reference screens consume tokens and recolor on mode switch

- **WHEN** a reference screen is viewed and the theme mode changes from light to dark
- **THEN** the screen and its sub-components recolor from `useTheme().tokens` without an app restart
- **AND** content surfaces read as content-first (flat + surface-levels + hairlines), with shadow/glass only on chrome
- **AND** message bubbles have no per-bubble drop shadow
- **AND** Settings groups use flat bands/dividers rather than repeated raised cards

#### Scenario: Chat bubbles restyled without touching gifted-chat internals

- **WHEN** chat message bubbles are restyled to V2
- **THEN** the changes live entirely within `renderBubble`/render callbacks
- **AND** `gifted-chat` internals, its FlatList perf tuning (`removeClippedSubviews:false`, `maxToRenderPerBatch:5`, `windowSize:7`, `updateCellsBatchingPeriod:100`), and `freezeOnBlur` are unchanged

#### Scenario: Reference screens cover applicable runtime states

- **WHEN** a reference screen enters a runtime state applicable to that surface
- **THEN** it renders the corresponding state using the state primitives, in both light and dark
- **AND** Conversation List covers loading, empty, offline, and error
- **AND** Chat Room covers loading, empty, and error while retaining its compact offline banner when cached messages remain usable

#### Scenario: Completion gated on on-device approval

- **WHEN** the three reference screens are implemented and verified
- **THEN** the change SHALL NOT be archived until the user approves the visual language on-device
- **AND** only after approval is the language considered locked for rollout in the subsequent screen-uplift change

