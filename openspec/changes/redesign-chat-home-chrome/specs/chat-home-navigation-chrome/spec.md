## ADDED Requirements

### Requirement: Search-first Chat home header

The Chat home header SHALL present universal search, QR scanning, and add in one shared command dock with visually separated touch targets.

#### Scenario: User opens universal search

- **WHEN** the user presses the search portion of the header
- **THEN** the app SHALL navigate to the existing Universal Search screen

#### Scenario: User opens QR scanning

- **WHEN** the user presses the QR action
- **THEN** the app SHALL open the existing QR scanner without first triggering universal search

### Requirement: Accessible header actions

Search, QR, and add actions SHALL expose descriptive accessibility labels and SHALL have non-overlapping touch targets of at least 48dp.

QR and add SHALL use glyphs from the same icon family, size, and semantic primary color. The command dock SHALL use spacing rather than visible divider lines between its actions and SHALL be inset from the header content edges.

The command dock SHALL use a static neutral perimeter without a persistent semantic-primary outline or border animation.

The header SHALL NOT render a separator rule between the command dock area and the Chat sub-tab bar.

#### Scenario: User activates add

- **WHEN** the user presses the add action
- **THEN** the existing group creation modal SHALL open

### Requirement: Coherent Chat sub-tab states

The five Chat sub-tabs SHALL use icon-only controls from one visual family with distinct inactive and active treatments, semantic colors, selected accessibility state, descriptive accessibility labels, at least 48dp touch targets, restrained transition motion, and a short semantic-primary underline for the selected icon. They SHALL NOT render visible text labels or a persistent selected background pill.

#### Scenario: User selects a Chat sub-tab

- **WHEN** a sub-tab becomes selected
- **THEN** its icon SHALL transition to its filled semantic-primary glyph with a restrained lift and rebound pulse, while its underline expands into view

#### Scenario: User presses a Chat sub-tab

- **WHEN** the user presses and releases a sub-tab icon
- **THEN** the icon SHALL provide immediate compression and recovery feedback without leaving a background shape behind

#### Scenario: User scrolls the Messages list

- **WHEN** the user scrolls the conversation list upward
- **THEN** the icon-only sub-tab rail SHALL animate out and collapse so no empty strip remains between the header and list

- **WHEN** the user scrolls the conversation list downward or returns to its top
- **THEN** the icon-only sub-tab rail SHALL animate back into view

#### Scenario: User navigates between sub-tabs

- **WHEN** the user taps or swipes between sub-tabs
- **THEN** existing route names, lazy loading, swipe behavior, and reset-to-messages behavior SHALL remain unchanged
