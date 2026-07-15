## MODIFIED Requirements

### Requirement: Shared primitives are theme-aware
The shared text primitive (`KoolaText` at `ChatApp/src/ui/KoolaText.tsx`) SHALL support the operating system's font scaling multiplier via a tiered cap system: content variants (display, title, heading, body) cap at 2.0x; chrome variants (label, caption) cap at 1.6x.

#### Scenario: System font scale is set to 2.0x with content text
- **WHEN** the user configures the operating system font size to its maximum (resulting in ~2.0x multiplier)
- **AND** the text uses a content variant (display, title, heading, body)
- **THEN** `KoolaText` SHALL allow the text to render at up to 2.0x the base size
- **AND** `maxFontSizeMultiplier` SHALL be set to 2.0 for content variants

#### Scenario: System font scale is set to maximum with chrome text
- **WHEN** the user configures the operating system font size to its maximum
- **AND** the text uses a chrome variant (label, caption)
- **THEN** `KoolaText` SHALL allow the text to render at up to 1.6x the base size
- **AND** `maxFontSizeMultiplier` SHALL be set to 1.6 for chrome variants
- **AND** this protects single-line hard layouts (KoolaBadge, KoolaChip with numberOfLines={1}) from content truncation

#### Scenario: Text wraps at high scale
- **WHEN** a content text exceeds its container width at 2.0x scale
- **THEN** the text SHALL wrap to additional lines by default (React Native unlimited wrap)
- **AND** no primary action, validation message, or navigation label SHALL be clipped

#### Scenario: Fixed-height container at high scale
- **WHEN** a consumer constrains text to a fixed-height container
- **THEN** the container SHOULD use `minHeight` instead of fixed `height` to allow growth
- **AND** the container SHALL NOT render partially visible truncated characters

#### Scenario: Existing screens remain usable
- **WHEN** the cap is raised from 1.3-1.5x to the new tiered caps (content 2.0, chrome 1.6)
- **THEN** no production workflow SHALL become blocked due to overlapping controls, unreachable buttons, or hidden form fields
- **AND** screens that were functional at 1.5x SHALL remain functional at the new caps
