## MODIFIED Requirements

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
