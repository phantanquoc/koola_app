## MODIFIED Requirements

### Requirement: Coherent Chat sub-tab states
The Chat sub-tabs SHALL use icon-only controls from one visual family with distinct inactive and active treatments, semantic colors, selected accessibility state, descriptive accessibility labels, at least 48dp touch targets, restrained transition motion, and a short semantic-primary underline for the selected icon. They SHALL NOT render visible text labels or a persistent selected background pill.

The Chat home sub-tab bar SHALL contain exactly four tabs: Messages, Contacts, Moments, and Xem trước (Shorts). The former Calls tab SHALL NOT be present. Navigation to `Calls` SHALL be invalid.

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
- **THEN** existing route names (Messages, Contacts, Moments, Shorts), lazy loading, swipe behavior, and reset-to-messages behavior SHALL remain unchanged

#### Scenario: Calls tab is absent
- **WHEN** the Chat home renders its sub-tab bar
- **THEN** exactly four icons are present and no Calls icon, label, or route exists

#### Scenario: Deep-link to removed Calls tab fails at compile time
- **WHEN** code attempts `navigation.navigate('Calls')` or references `ChatSubTabParamList['Calls']`
- **THEN** type-checking SHALL fail
