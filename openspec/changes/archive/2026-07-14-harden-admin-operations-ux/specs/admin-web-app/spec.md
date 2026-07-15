## ADDED Requirements

### Requirement: Admin shell affordances represent real behavior
Interactive-looking shell elements and operational status signals SHALL correspond to functional, current application state.

#### Scenario: Command shortcut is displayed
- **WHEN** the shell displays a `Cmd/Ctrl+K` command or search affordance
- **THEN** clicking it or pressing the documented shortcut SHALL focus or open a functional command/search control
- **AND** the control SHALL be keyboard operable and accessibly labelled

#### Scenario: Command functionality is unavailable
- **WHEN** no command/search behavior is implemented
- **THEN** the shell SHALL not render a shortcut or interactive-looking command field

#### Scenario: Admin identity is shown
- **WHEN** the authenticated shell renders profile identity
- **THEN** name, initials, and role SHALL derive from the authenticated session rather than hard-coded placeholders

#### Scenario: Health status is shown
- **WHEN** the shell displays a live/health status
- **THEN** the status SHALL derive from a measured source and expose freshness/loading/error state
- **AND** an unmeasured static `Live` claim SHALL not be shown

### Requirement: Admin overlays manage focus completely
Admin dialogs and drawers SHALL contain keyboard focus, expose correct semantics, and restore the user's context when closed.

#### Scenario: Overlay opens
- **WHEN** a dialog or drawer opens
- **THEN** focus SHALL move to its heading, first field, or safest primary control
- **AND** background content SHALL not receive pointer or keyboard interaction

#### Scenario: User tabs through overlay
- **WHEN** focus reaches the final or first focusable element
- **THEN** Tab or Shift+Tab SHALL remain within the overlay

#### Scenario: Overlay closes
- **WHEN** the user safely closes the overlay with its control or Escape
- **THEN** focus SHALL return to the triggering control
- **AND** background scroll state SHALL be restored

### Requirement: Admin actions communicate their lifecycle
High-impact admin operations SHALL expose target, pending, success, and failure state and SHALL prevent duplicate submission.

#### Scenario: Operation is pending
- **WHEN** approve, reject, ban, or unban is in flight
- **THEN** duplicate submission SHALL be disabled
- **AND** the active overlay or row SHALL expose a busy state

#### Scenario: Operation succeeds
- **WHEN** the server confirms an admin operation
- **THEN** visible feedback SHALL identify the completed action and target
- **AND** affected lists and metrics SHALL update consistently

#### Scenario: Operation fails
- **WHEN** an admin operation fails
- **THEN** the target context and entered reason SHALL remain available
- **AND** the UI SHALL provide an actionable retry or correction path

### Requirement: Error feedback uses accessible in-app notifications
Admin operation error and success feedback SHALL NOT use browser `alert()` and SHALL use accessible in-app notification components.

#### Scenario: Operation error is shown
- **WHEN** an approve, reject, ban, or unban operation fails
- **THEN** feedback SHALL be rendered as an in-app notification (toast, banner, or inline message)
- **AND** the notification SHALL have an ARIA live region (`role="alert"` or `aria-live="assertive"`) for screen reader users
- **AND** browser `alert()` SHALL NOT be used (defect: `BusinessesPage.tsx:84`, `UsersPage.tsx:100,118` use `alert()`)

#### Scenario: Operation success is shown
- **WHEN** an admin operation succeeds
- **THEN** completion feedback SHALL use the same in-app notification system
- **AND** it SHALL NOT use browser `alert()`

### Requirement: Overlays close on backdrop interaction
Admin dialogs and drawers SHALL support closing via backdrop click in addition to the close button and Escape key.

#### Scenario: User clicks the backdrop
- **WHEN** a dialog or drawer is open and the user clicks the dimmed backdrop area
- **THEN** the overlay SHALL close (unless it contains unsaved required input, in which case a confirmation may be shown)
- **AND** focus SHALL return to the triggering control

### Requirement: Narrow admin navigation preserves workspace access
The admin shell SHALL provide compact navigation at narrow supported widths without placing the entire desktop sidebar ahead of page content.

#### Scenario: Viewport is 500px wide
- **WHEN** an authenticated admin opens any primary page
- **THEN** primary navigation and profile/session actions SHALL remain reachable through a compact control
- **AND** the page heading and primary work SHALL remain in the first viewport
