## ADDED Requirements

### Requirement: Focused primary-tab glow treatment
The floating primary dock SHALL render a gradient ring and soft outer glow around the focused tab item, derived from the focused-tab glow ring primitive and semantic tokens, applied consistently to all primary tabs in both schemes.

#### Scenario: Focused tab shows glow ring on light scheme
- **WHEN** a primary tab is focused with the light scheme
- **THEN** the tab item SHALL show the gradient ring and outer glow around its icon well
- **AND** unfocused items SHALL NOT show the ring

#### Scenario: Focused tab shows glow ring on dark scheme
- **WHEN** the active theme resolves to dark
- **THEN** the focused tab ring and glow SHALL render with the dark-scheme primitive variants

#### Scenario: Tab switch animates without perpetual loops
- **WHEN** focus moves between tabs
- **THEN** the ring and glow SHALL animate with bounded timing animations only
- **AND** no perpetual reanimated loop SHALL be introduced

#### Scenario: Dock geometry and suppression invariants preserved
- **WHEN** the glow treatment renders
- **THEN** dock height, floating inset, tab bar bottom inset hook, tab dock suppression, and fullscreen route hiding SHALL behave exactly as before
- **AND** the ring SHALL render within the existing icon well bounds without changing layout metrics
