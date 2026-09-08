## ADDED Requirements

### Requirement: Light-field background primitive
The theme SHALL expose an additive light-field primitive providing, per scheme, a base canvas color and an ordered list of radial bloom stops (color, opacity, relative center, relative radius) so screens can render soft static light blooms without hard-coding hex values or adding dependencies.

#### Scenario: Both schemes define the light field
- **WHEN** a screen requests the light-field primitive
- **THEN** the theme SHALL return complete stop lists for both the light and dark schemes

#### Scenario: Existing token values unchanged
- **WHEN** the light-field primitive is added
- **THEN** all pre-existing token values in `koolaColors`, `koolaDarkColors`, `koolaRadii`, `koolaSpacing`, `koolaTypography`, `koolaShadows`, and `koolaDarkShadows` SHALL remain byte-for-byte unchanged

### Requirement: Glow shadow primitive
The theme SHALL expose an additive glow shadow primitive with per-scheme variants for card elevation, header elevation, and focused-tab glow. The light variant SHALL use colored soft shadows; the dark variant SHALL express elevation through lighter surface tints, hairlines, or colored glows instead of black shadows.

#### Scenario: Card glow on light scheme
- **WHEN** a card requests the glow shadow on the light scheme
- **THEN** it SHALL receive a colored soft shadow stack from the primitive

#### Scenario: Card glow on dark scheme
- **WHEN** a card requests the glow shadow on the dark scheme
- **THEN** it SHALL receive a dark-scheme variant that remains visible on dark canvas and SHALL NOT use black shadow color

### Requirement: Icon well primitive
The theme SHALL expose an additive per-scheme icon-well background token for circular icon wells; icon glyphs inside wells SHALL still take their color from semantic text or action tokens.

#### Scenario: Row icons use the well token
- **WHEN** a card row renders an icon well
- **THEN** the well fill SHALL come from the icon-well primitive for the active scheme
- **AND** the glyph color SHALL come from semantic tokens

### Requirement: Focused-tab glow ring primitive
The theme SHALL expose an additive per-scheme ordered gradient stop list for the focused-tab glow ring so the dock and any future chrome share one ring recipe.

#### Scenario: Ring stops available per scheme
- **WHEN** the dock renders the focused tab ring
- **THEN** the ring gradient stops SHALL be read from the primitive for the active scheme
