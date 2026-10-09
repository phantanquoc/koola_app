## ADDED Requirements

### Requirement: Connect Home Dock Carries QR And Filter Actions

The Kết nối home header dock SHALL render three actions in one shared pill: search, QR scan, and filter. The QR and filter actions SHALL match the Chat tab's dock action geometry — a 48dp-wide, full-height pressable with pill radius, containing a MaterialIcons glyph at size 22 in `semantic.action.primary`, wrapped in a `0.82` scale transform — and SHALL expose `accessibilityRole="button"` with descriptive Vietnamese labels and a hittable area of at least 48dp. The QR action SHALL open the existing QR scanner modal. The filter action SHALL open the existing Connect filter sheet. Neither action SHALL trigger universal search.

The filter action SHALL show a count badge when any secondary filter is active, counting sort (when not the default `latest`), province (when set), and category (when set). The badge SHALL use `semantic.status.danger` as its background, SHALL be hidden when the count is zero, and SHALL carry the count in the filter action's accessibility label.

The Connect header SHALL NOT carry a fourth action.

#### Scenario: User opens the QR scanner from Connect

- **WHEN** the user presses the QR action in the Kết nối dock
- **THEN** the QR scanner modal SHALL open without universal search being triggered

#### Scenario: User opens the filter sheet from Connect

- **WHEN** the user presses the filter action in the Kết nối dock
- **THEN** the Connect filter sheet SHALL open, exposing sort, province, and category controls

#### Scenario: Filter badge reflects secondary filters

- **WHEN** the user has selected a province and a non-default sort, and no category
- **THEN** the filter action SHALL show a badge reading 2, and its accessibility label SHALL state that 2 filters are applied

#### Scenario: Filter badge hidden with no secondary filters

- **WHEN** sort is `latest`, province is empty, and no category is selected
- **THEN** no badge SHALL be rendered on the filter action

### Requirement: Connect Sub-Menu Is A Text Bar Matching Chat

Below the header box, the Kết nối home SHALL render a text sub-menu bar of height 40dp containing exactly three items: `Tất cả`, `Yêu cầu mua`, and `Yêu cầu bán`. Items SHALL be evenly divided across the full width using `flex: 1` with space-between justification and 4dp horizontal container padding, and SHALL NOT use the `gap` style property on the row container. The bar SHALL NOT render pill backgrounds, chip borders, or a horizontally scrolling container.

Each item SHALL be a pressable with `accessibilityRole="button"`, `accessibilityState={{ selected }}`, and an accessibility label equal to its visible text. The selected item's label SHALL use `semantic.action.primary`; unselected labels SHALL use `semantic.text.muted`. Labels SHALL be single-line and SHALL NOT truncate at the default font scale.

The selected item SHALL render a gradient underline of width 20dp, height 2dp, and radius 1, inset 5dp below the label baseline, using the same orange-to-blue gradient as the Chat sub-tab bar (`#FF8A1A` → `#2563EB` in light scheme, `#FF9A3D` → `#4D8DF7` in dark scheme). Unselected items SHALL render no underline.

Pressing an item that is already selected and is not `Tất cả` SHALL reset the relationship filter to `all`. Pressing `Tất cả` while it is already selected SHALL leave the filter at `all`.

#### Scenario: User selects a relationship sub-menu item

- **WHEN** the user presses `Yêu cầu mua`
- **THEN** the relationship filter SHALL become `partner`, the item SHALL render its label in the primary color with a gradient underline, and the other two items SHALL render muted labels with no underline

#### Scenario: User clears an active relationship filter by re-pressing

- **WHEN** `Yêu cầu bán` is selected and the user presses it again
- **THEN** the relationship filter SHALL reset to `all` and `Tất cả` SHALL become the selected item

#### Scenario: Sub-menu layout survives font scaling

- **WHEN** the device font scale is raised to the maximum supported by chrome text variants
- **THEN** all three labels SHALL remain on one line without wrapping or clipping, and the bar height SHALL remain 40dp

### Requirement: Connect Home Renders One Continuous Glass Sheet

The Kết nối home chrome SHALL render as a single continuous glass sheet spanning the header box and the sub-menu bar, with no hairline rule, seam, or gap between them. The sheet SHALL be produced by the shared `ChromeGlassSheet` component, and the Connect header box SHALL render in glass-less mode so it does not paint a second competing sheet.

The sheet SHALL continue to carry the resting hairline at its bottom edge and the elevation shadow that fades in as list content scrolls behind it.

#### Scenario: No seam between header and sub-menu

- **WHEN** the user views the Kết nối home at rest
- **THEN** no hairline rule or visible gap SHALL appear between the header box region and the sub-menu bar

#### Scenario: Glass appearance matches Chat

- **WHEN** the user switches between the Trò chuyện and Kết nối tabs at rest
- **THEN** the glass tint, bloom, hairline, and shadow appearance SHALL be identical between the two tabs

#### Scenario: Sheet lifts when content scrolls behind it

- **WHEN** the user scrolls the Kết nối list so rows pass behind the sheet
- **THEN** the elevation shadow SHALL fade in and the resting hairline SHALL fade out

### Requirement: Connect List Content Clears The Unified Chrome

The Kết nối list SHALL reserve a resting top inset equal to the header box height plus the 40dp sub-menu bar, so the first business card is fully visible at scroll position 0. The filter row's former 44dp reserve and its surrounding gaps SHALL NOT remain in the inset.

The scroll-hide behaviour SHALL animate the sub-menu bar out and collapse its space when the user scrolls down, and animate it back when the user scrolls up or returns to the top. When the platform reduce-motion setting is enabled, the sub-menu bar SHALL remain visible and SHALL NOT animate on scroll.

#### Scenario: First card fully visible at rest

- **WHEN** the user opens Kết nối at scroll position 0
- **THEN** the first business card SHALL be fully visible below the sub-menu bar with no part hidden underneath

#### Scenario: Sub-menu collapses on downward scroll

- **WHEN** the user scrolls the Kết nối list downward past the hide threshold
- **THEN** the sub-menu bar SHALL animate out and its space SHALL collapse so no empty strip remains between the header and the list

#### Scenario: Reduce-motion keeps the sub-menu visible

- **WHEN** the platform reduce-motion setting is enabled and the user scrolls the Kết nối list
- **THEN** the sub-menu bar SHALL remain visible and SHALL NOT animate

### Requirement: Connect Error State Keeps The Unified Chrome

When the discovery request fails and no items are available, the Kết nối screen SHALL render the same unified chrome as the normal state — glass-less header box, shared glass sheet, and text sub-menu bar. The error state SHALL NOT fall back to a different chrome composition.

#### Scenario: Error state chrome matches normal state

- **WHEN** the discovery request fails with no cached items
- **THEN** the screen SHALL show the error state below the same unified chrome, and the header dock SHALL still expose the search, QR, and filter actions