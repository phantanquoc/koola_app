## ADDED Requirements

### Requirement: Row containers do not combine gap with flex:1 children
Mobile row-direction flex containers SHALL NOT use the `gap` style property when children use `flex:1`, due to the Hermes RN 0.76 Yoga layout bug that causes children to wrap to new lines.

#### Scenario: Row container spaces children horizontally
- **WHEN** a `flexDirection:'row'` container needs spacing between `flex:1` children
- **THEN** spacing SHALL be achieved via `marginRight`/`marginLeft` on children
- **AND** `gap` SHALL NOT be used on the container

#### Scenario: ui:audit detects no gapFlexRow violations
- **WHEN** `npm run ui:audit` is executed
- **THEN** the `gapFlexRow` count SHALL be 0
- **AND** no file SHALL appear in the gapFlexRow bucket

#### Scenario: Visual spacing is preserved
- **WHEN** `gap` is replaced with margin-based spacing
- **THEN** the visual spacing between row children SHALL remain identical to the original `gap` value
- **AND** children SHALL remain on a single horizontal line without wrapping

#### Scenario: Children do not shrink unexpectedly
- **WHEN** a row child uses `flex:1` after gap removal
- **THEN** `flexShrink:0` SHALL be applied where needed to prevent unintended shrinking
- **AND** the child SHALL occupy its intended proportion of the row
