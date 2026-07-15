## ADDED Requirements

### Requirement: Authentication forms remain reachable with the keyboard open
Every mobile authentication form SHALL keep its focused field, validation feedback, and primary action reachable on compact supported devices.

#### Scenario: Keyboard covers the lower viewport
- **WHEN** the user focuses a lower form field and the software keyboard opens
- **THEN** the form SHALL scroll the focused field and its error text into view
- **AND** the user SHALL be able to reach the primary action without dismissing the keyboard

#### Scenario: Content exceeds the viewport
- **WHEN** translated copy, validation messages, or large text make an auth screen taller than the viewport
- **THEN** all interactive content SHALL remain reachable through scrolling

### Requirement: Secure inputs provide an accessible visibility control
Password fields SHALL offer a show/hide control without changing the field value or validation state.

#### Scenario: User reveals a password
- **WHEN** the user activates the password visibility control
- **THEN** the current value SHALL become visible
- **AND** the control accessible name SHALL change to describe the hide action

#### Scenario: User hides a password again
- **WHEN** the user activates the control while the value is visible
- **THEN** secure entry SHALL be restored without clearing the value

### Requirement: Validation feedback is associated with its input
Authentication validation SHALL expose one consistent visual and accessible error state per invalid field.

#### Scenario: Submit contains multiple invalid fields
- **WHEN** the user submits an invalid form
- **THEN** each invalid input SHALL expose its error state and message
- **AND** focus SHALL move to the first invalid field

#### Scenario: User corrects a field
- **WHEN** a field becomes valid according to the current validation policy
- **THEN** stale error styling and accessibility state SHALL clear consistently

### Requirement: Authentication supports large text without clipping
Authentication screens SHALL remain operable at the app's maximum supported font scale (~1.5x as enforced by `KoolaText` `maxFontSizeMultiplier`) and SHALL meet applicable WCAG AA contrast targets.

#### Scenario: System font size is at maximum supported scale
- **WHEN** text renders at the maximum supported multiplier (~1.5x)
- **THEN** labels, inputs, links, errors, and buttons SHALL wrap or grow without clipping or overlap
- **AND** no auth action or validation message SHALL be cut off or hidden

#### Scenario: Primary action is enabled
- **WHEN** the primary action renders normal-size text on its fill
- **THEN** the text-to-fill contrast SHALL be at least 4.5:1

> **Note:** Raising the font scale cap toward WCAG 200% (2.0x) is a separate concern tracked by change `raise-mobile-font-scale-cap` (#9). This change verifies auth screens work at the CURRENT maximum.

### Requirement: Android keyboard does not obscure form fields
Authentication screens SHALL keep focused fields and actions reachable on Android where `KeyboardAvoidingView` with `behavior={undefined}` is a no-op.

#### Scenario: Android user focuses a lower field
- **WHEN** a user on Android focuses an input below the midpoint and the keyboard opens
- **THEN** the form SHALL scroll or reposition to keep the field, its error text, and the primary action visible
- **AND** the solution SHALL NOT rely solely on `KeyboardAvoidingView behavior='padding'` which is iOS-only

### Requirement: Inputs provide accessible labels
Every text input on authentication screens SHALL have a programmatic accessible label independent of placeholder text.

#### Scenario: Screen reader announces an input
- **WHEN** a screen reader user navigates to an auth input
- **THEN** the control SHALL announce a descriptive `accessibilityLabel` (e.g. "Email", "Mat khau")
- **AND** the label SHALL NOT be only the placeholder string

### Requirement: Validation errors are announced to assistive technology
Field validation errors SHALL be announced so screen-reader users are informed without visual inspection.

#### Scenario: Submit with invalid fields
- **WHEN** the user submits and validation errors appear
- **THEN** each error SHALL be announced via `AccessibilityInfo.announceForAccessibility` or equivalent
- **AND** focus SHALL move to the first invalid field

### Requirement: OTP hidden input is accessible
The OTP code entry (hidden `TextInput` driving visible digit boxes) SHALL expose correct accessible semantics.

#### Scenario: Screen reader user enters OTP
- **WHEN** a screen reader user navigates to the OTP entry
- **THEN** the control SHALL announce its purpose (e.g. "Ma xac thuc, 6 chu so")
- **AND** digit entry SHALL be operable without sighted interaction with the invisible input

### Requirement: Auth submission state prevents duplicate actions
Auth forms SHALL communicate submission state without trapping the user in an unexplained disabled state.

#### Scenario: Request is in progress
- **WHEN** an auth request is pending
- **THEN** the primary action SHALL expose a busy state and prevent duplicate submission
- **AND** navigation and recovery controls SHALL follow the existing flow's safety rules

#### Scenario: Request fails
- **WHEN** an auth request returns a user-recoverable error
- **THEN** the relevant field or form error SHALL be announced and remain visible until corrected or retried
