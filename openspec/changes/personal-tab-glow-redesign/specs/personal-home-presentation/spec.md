## ADDED Requirements

### Requirement: Card-based personal home layout
The Personal home screen SHALL present its content as floating rounded cards over a static light-field background instead of flat hairline-bordered sections, using semantic surface tokens for card fills and the shared radius/spacing scales for geometry.

#### Scenario: Light scheme renders card layout
- **WHEN** the Personal home screen is visible with the light scheme
- **THEN** each content group SHALL render as a rounded card filled from semantic surface tokens over the light-field background
- **AND** no card SHALL use a hard-coded hex fill in screen code

#### Scenario: Dark scheme renders card layout
- **WHEN** the active theme resolves to dark
- **THEN** the background, cards, and row fills SHALL render with dark semantic surfaces and dark glow variants
- **AND** no white flash or forced light surface SHALL appear

#### Scenario: Scroll clearance above the dock is preserved
- **WHEN** the user scrolls the Personal home list to its end
- **THEN** the last card and the logout action SHALL remain fully visible above the floating tab dock using the existing tab bar bottom inset hook

### Requirement: Notch logo header
The Personal home screen SHALL show a compact notch-style header carrying the existing Koola logo, inset below the status bar, filled from semantic surface tokens.

#### Scenario: Header renders under the status bar
- **WHEN** the Personal home screen is visible
- **THEN** the header SHALL start below the status bar height and center the Koola logo
- **AND** the header SHALL NOT overlap scrollable content at scroll offset zero

### Requirement: Profile card composition
The profile header SHALL be a horizontal card containing the user avatar with a ring, the display name, an email-or-phone subtitle, an edit affordance navigating to EditProfile, and a "Chuyển đổi tài khoản" row navigating to the existing AccountList screen.

#### Scenario: User opens profile editing
- **WHEN** the user presses the profile card body
- **THEN** the app SHALL navigate to the EditProfile screen

#### Scenario: User switches account
- **WHEN** the user presses the "Chuyển đổi tài khoản" row
- **THEN** the app SHALL navigate to the AccountList screen

#### Scenario: Long display name
- **WHEN** the display name exceeds one line
- **THEN** the name SHALL ellipsize within two lines and SHALL NOT push the card height unbounded

#### Scenario: Missing avatar
- **WHEN** the user has no avatar URL
- **THEN** the avatar SHALL render the existing initials fallback

### Requirement: Account information card
The Personal home screen SHALL show an "Thông tin tài khoản" card listing the authenticated user's phone and email as icon rows; a row whose underlying field is absent SHALL be hidden entirely.

#### Scenario: Phone present
- **WHEN** the authenticated user has a phone value
- **THEN** the card SHALL show a phone icon row with that value

#### Scenario: Phone absent
- **WHEN** the authenticated user has no phone value
- **THEN** the phone row SHALL NOT render and SHALL NOT show an empty placeholder

### Requirement: Settings and security card preserves behavior
All existing settings entries (theme mode selector, auto-translate switch, preferred language row and picker, notifications switch, privacy info, about info, cache/storage entry) SHALL be grouped in one card while preserving every existing handler, API call, busy state, rollback, error alert, and navigation target.

#### Scenario: Auto-translate toggle fails
- **WHEN** the auto-translate settings update request fails
- **THEN** the switch SHALL roll back to its previous value and show the existing error alert

#### Scenario: Language picker selection
- **WHEN** the user selects a preferred language in the picker
- **THEN** the selection SHALL persist through the existing translation prefs and user settings update flow
- **AND** the picker SHALL close

#### Scenario: Storage entry navigation
- **WHEN** the user presses the cache/storage row
- **THEN** the app SHALL navigate to StorageSettings

### Requirement: Logout pill action
The logout action SHALL render as an outlined danger pill button that invokes the existing logout flow with an accessible label.

#### Scenario: User logs out
- **WHEN** the user presses the logout pill
- **THEN** the existing auth logout flow SHALL run unchanged

### Requirement: Personal home accessibility and contrast
The redesigned screen SHALL preserve accessible roles and labels for every interactive element, keep touch targets at or above 44dp, and keep all text contrast at WCAG 2.1 AA by sourcing text colors from semantic tokens; glow and gradient imagery SHALL be decorative only.

#### Scenario: Screen reader traversal
- **WHEN** a screen reader traverses the Personal home screen
- **THEN** every row, switch, and button SHALL expose the same accessible names and states as before the redesign

#### Scenario: Decorative glow carries no information
- **WHEN** glow or gradient imagery is rendered
- **THEN** no state or meaning SHALL be conveyed by the glow alone

### Requirement: Developer playground row preserved
The `__DEV__`-only Logo Lab row SHALL remain present in development builds and absent in production builds.

#### Scenario: Development build shows Logo Lab
- **WHEN** the app runs with `__DEV__` true
- **THEN** the Logo Lab row SHALL render and navigate as before
