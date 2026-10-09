## MODIFIED Requirements

### Requirement: Dock Is Configurable Via Right Actions

`ChromeHeaderBox` SHALL accept an optional `rightActions` React node rendered to the right of the search action inside the same `HeaderSearchDock` pill. `HeaderSearchDock` SHALL accept optional `rightActions` and an optional `hiddenProgress` shared value that fades the pill fill via smoothstep. When `rightActions` is absent, the pill SHALL render only the search pressable stretching to full width.

Dock icon actions SHALL be rendered through a shared `HeaderDockAction` component exposing an icon name, `onPress`, an accessibility label, and an optional count badge, so that consumers do not each re-implement the pressable block. The `onQrPress` and `onAddPress` props SHALL remain deprecated and SHALL NOT be used by new call sites.

Connect SHALL pass QR and filter as its `rightActions`; Chat SHALL pass QR and add.

#### Scenario: Connect shows search plus QR and filter

- **WHEN** the user opens the Kết nối tab
- **THEN** the header pill contains the search action plus a QR action and a filter action on the right

#### Scenario: Chat shows search plus QR and add

- **WHEN** the user opens the Trò chuyện tab
- **THEN** the header pill contains the search action plus QR and add icon buttons on the right

#### Scenario: Search pill remains accessible

- **WHEN** the pill renders with or without right actions
- **THEN** the search pressable SHALL have `accessibilityRole="button"`, an accessibility label identifying search, and a hittable area of at least 44dp

#### Scenario: Dock actions share one implementation

- **WHEN** inspecting the QR and add actions in Chat and the QR and filter actions in Connect
- **THEN** all four SHALL be rendered by the shared `HeaderDockAction` component with the same width, height, radius, glyph size, and icon color

### Requirement: Shared Glass Sheet Contract

The chrome glass sheet that spans a tab's header box and its sub-menu bar SHALL be produced by a single shared `ChromeGlassSheet` component. The component SHALL own the glass tint, the light-field bloom, the resting hairline, the elevation shadow, and the animated sheet height, and SHALL accept the header block height, the sub-menu bar height, and the shared visibility progress values as inputs. Consumers SHALL NOT define their own copies of the glass tint, bloom opacity, shadow, or scrim constants.

The elevation shadow SHALL fade in and the resting hairline SHALL fade out as content scrolls behind the sheet.

#### Scenario: Single source for glass appearance

- **WHEN** inspecting the Trò chuyện and Kết nối home screens
- **THEN** both SHALL render the shared `ChromeGlassSheet` component and neither SHALL define its own glass tint or bloom constants

#### Scenario: Glass appearance is identical across tabs

- **WHEN** the user switches between the Trò chuyện and Kết nối tabs at rest
- **THEN** the glass tint, bloom, hairline, and shadow SHALL be visually identical between the two tabs

#### Scenario: Hairline and shadow swap on scroll

- **WHEN** the user scrolls either tab's list so rows pass behind the sheet
- **THEN** the elevation shadow SHALL be visible and the resting hairline SHALL be hidden

### Requirement: List Content Starts Below The Shared Box

Lists below the shared header chrome SHALL offset their content so the first row is fully visible at scroll position 0. Chat SHALL use `paddingTop` equal to `blockH` plus its sub-tab bar; Connect SHALL use `paddingTop` equal to `blockH` plus its sub-menu bar.

#### Scenario: First row not obscured at top

- **WHEN** the user opens either tab at scroll position 0
- **THEN** the first list item is fully visible below the chrome with no part hidden underneath

#### Scenario: Connect reserves no filter-row strip

- **WHEN** the user opens the Kết nối tab at scroll position 0
- **THEN** the first business card SHALL sit directly below the sub-menu bar with no empty strip between them