## ADDED Requirements

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
