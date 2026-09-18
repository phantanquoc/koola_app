# chat-search-dock Specification

## Purpose
TBD - created by archiving change chat-search-dock-redesign. Update Purpose after archive.
## Requirements
### Requirement: Glass dock shell

The Chat search dock SHALL render as a fixed top-docked glass surface composed of BlurView with blurAmount 18, a dark/light overlay via BlurView overlayColor, an innerEdge top highlight, a hairline border, and a medium shadow.

#### Scenario: Glass renders on light scheme

- **WHEN** the Tron chuyen tab is visible with the light scheme
- **THEN** the dock SHALL show BlurView blurAmount 18 with overlayColor rgba(255,255,255,0.62), innerEdge highlight rgba(255,255,255,0.55), hairline border rgba(0,0,0,0.08), and shadow md offset {0,8} radius 24 opacity 0.12

#### Scenario: Glass renders on dark scheme

- **WHEN** the active theme resolves to dark
- **THEN** the dock SHALL show overlayColor rgba(28,32,38,0.52), innerEdge highlight rgba(255,255,255,0.08), hairline border rgba(255,255,255,0.10), and shadow md opacity 0.35

#### Scenario: Layer order is correct

- **WHEN** the dock is rendered
- **THEN** the layer order SHALL be Animated.View shadowWrap with shadow -> View host with hairline border and overflow hidden -> BlurView full-fill with overlayColor -> innerEdge -> content Animated.View row. Shadow lives on the outer shadowWrap (overflow visible) so it is not clipped; blur/content are clipped inside host.

### Requirement: Morph height 48 to 36 via SharedValue and interpolate

The dock height SHALL morph from 48 to 36 driven by a SharedValue dockProgress in [0,1] through useAnimatedStyle with interpolate on a worklet. dockProgress is a BINARY TOGGLE (0 expanded, 1 collapsed) driven by scroll-direction thresholds, NOT a linear 0..80 interpolation.

#### Scenario: Expanded at top

- **WHEN** scrollY is at 0 (or offsetY <= 4)
- **THEN** dockProgress SHALL be 0 and the dock height SHALL be 48 with paddingHorizontal 4 and gap 10

#### Scenario: Collapsed after scroll threshold

- **WHEN** the user scrolls down with directional travel > 8
- **THEN** dockProgress SHALL toggle to 1 via withTiming duration 260 and the dock height SHALL be 36 with paddingHorizontal 4 and gap 6

#### Scenario: Return to expanded via upward travel threshold

- **WHEN** the user scrolls up with directional travel < -8, or offsetY <= 4
- **THEN** dockProgress SHALL toggle back to 0 via withTiming duration 220 (or 180 when snapping to top) and restore height 48

#### Scenario: No linear intermediate mapping

- **WHEN** inspecting the scroll handler
- **THEN** dockProgress SHALL NOT be computed as a linear clamp of scrollY 0..80 (e.g. interpolate/clamp mapping); it SHALL only change via the direction threshold toggle described above, animating between 0 and 1 with withTiming

### Requirement: Keep three action buttons when collapsed

The dock SHALL keep all three action buttons visible in both expanded and collapsed states, only tightening padding, gap, and icon/text scale when collapsed.

#### Scenario: All three buttons remain tappable when collapsed

- **WHEN** the dock is fully collapsed (progress 1)
- **THEN** all three buttons SHALL still render and each SHALL remain tappable with an effective hit target of at least 36 height (44 with hitSlop)

#### Scenario: No button is hidden via display none

- **WHEN** inspecting the collapsed layout
- **THEN** no button SHALL use display none, conditional unmount, or zero opacity to hide

### Requirement: List scrolls behind dock via contentContainerStyle paddingTop

The conversation list SHALL scroll behind the fixed dock by reserving space through contentContainerStyle paddingTop equal to the expanded dock height plus top inset, rather than an outer margin.

#### Scenario: First row fully visible at scroll zero

- **WHEN** the list is at scroll offset zero
- **THEN** the first row SHALL appear fully below the dock with no clipping, using paddingTop of 48 plus topInset plus 8 safe spacing

#### Scenario: Content slides behind glass on scroll

- **WHEN** the user scrolls the list
- **THEN** list content SHALL slide behind the translucent glass dock instead of pushing the dock

### Requirement: Reduce-motion disables morph

When the system reduce-motion preference is enabled, the dock SHALL disable morph interpolation and remain pinned at the expanded fixed state. The worklet SHALL NOT call prefersReducedMotion() inside the worklet; the JS thread SHALL read the preference outside the worklet and the worklet SHALL branch on the captured boolean / SharedValue.

#### Scenario: Reduce-motion on pins dock expanded

- **WHEN** AccessibilityInfo.isReduceMotionEnabled() resolves to true or prefersReducedMotion is true
- **THEN** dockProgress SHALL be forced to 0 without withTiming and the dock SHALL render at fixed height 48 with static styles and no interpolation; the scroll handler SHALL early-return without scheduling withTiming

#### Scenario: Reduce-motion off restores morph

- **WHEN** reduce-motion is subsequently disabled
- **THEN** the dock SHALL resume scroll-driven toggle behavior

### Requirement: Sub-tab, unread, and search behavior unchanged

The redesign SHALL NOT alter sub-tab switching, unread badge counts or behavior, search filtering logic, or navigation targets of the Tron chuyen tab.

#### Scenario: Sub-tab and unread preserved

- **WHEN** the user switches sub-tabs or views unread badges
- **THEN** the existing sub-tab and unread behavior SHALL remain identical to before the change

#### Scenario: Search logic preserved

- **WHEN** the user types in the search input
- **THEN** the existing search/filter logic and result handling SHALL remain unchanged

