# admin-web-app Specification

## Purpose
TBD - created by archiving change admin-web-platform. Update Purpose after archive.
## Requirements
### Requirement: Standalone Admin Web Application
The system SHALL include a standalone admin web application in a top-level `admin-web/` directory built with React + Vite + TypeScript, independent of the React Native app, with its own `package.json`, TypeScript config, and lint config, and a `build` and `lint` script that pass.

#### Scenario: Project builds and lints
- **WHEN** `npm run build` and `npm run lint` are run in `admin-web/`
- **THEN** both SHALL complete successfully with no errors

#### Scenario: Independent of mobile build
- **WHEN** the admin web app is built
- **THEN** it SHALL NOT depend on or import from the `ChatApp/` React Native project

### Requirement: Admin Login
The admin web app SHALL provide a Login screen that authenticates via the existing `POST /auth/login`, stores the returned token client-side, then confirms admin authority via `GET /admin/me` before entering the app.

#### Scenario: Successful admin login
- **WHEN** a platform admin submits valid credentials
- **THEN** the app SHALL store the token, confirm admin via `GET /admin/me`, and navigate to the dashboard

#### Scenario: Non-admin login blocked
- **WHEN** a valid non-admin user logs in and `GET /admin/me` returns 403
- **THEN** the app SHALL show an authorization error and SHALL clear the stored token

#### Scenario: Invalid credentials
- **WHEN** login credentials are invalid
- **THEN** the app SHALL show an error and SHALL NOT navigate into the app

### Requirement: Route Guard
The admin web app SHALL guard all protected pages: a request without a stored token SHALL redirect to Login, and any admin API call returning 401 or 403 SHALL clear the token and redirect to Login.

#### Scenario: Unauthenticated access redirected
- **WHEN** a user without a token navigates to a protected page
- **THEN** the app SHALL redirect to the Login screen

#### Scenario: Expired or revoked authorization
- **WHEN** an admin API call returns 401 or 403
- **THEN** the app SHALL clear the token and redirect to Login

### Requirement: Dashboard Screen
The admin web app SHALL provide a Dashboard screen that displays the counts from `GET /admin/stats`.

#### Scenario: Dashboard renders stats
- **WHEN** an authenticated admin opens the dashboard
- **THEN** the screen SHALL display total users by account type, businesses by verification status, the pending count, and the banned count

### Requirement: Business Verification Screen
The admin web app SHALL provide a pending-businesses screen that lists `GET /admin/businesses/pending`, lets the admin view each business's license image (via the provided URL), approve a business, or reject it with a required reason captured in a modal.

#### Scenario: View and approve
- **WHEN** an admin views a pending business and clicks Approve
- **THEN** the app SHALL call the approve endpoint and the business SHALL be removed from the pending list on success

#### Scenario: Reject with reason
- **WHEN** an admin clicks Reject, enters a reason, and confirms
- **THEN** the app SHALL call the reject endpoint with the reason and remove the business from the pending list on success

#### Scenario: View license image
- **WHEN** a pending business has a license image URL
- **THEN** the screen SHALL render the image from that URL

### Requirement: User Management Screen
The admin web app SHALL provide a Users screen that lists `GET /admin/users` with search and `accountType` filter, navigates to a user detail view (`GET /admin/users/:id`), and provides Ban/Unban actions with a confirmation step.

#### Scenario: Search and filter users
- **WHEN** an admin types a search term or selects an account-type filter
- **THEN** the list SHALL update to matching users

#### Scenario: Ban with confirmation
- **WHEN** an admin clicks Ban on a user and confirms
- **THEN** the app SHALL call the ban endpoint and reflect the banned state on success

#### Scenario: Unban
- **WHEN** an admin clicks Unban on a banned user and confirms
- **THEN** the app SHALL call the unban endpoint and reflect the active state on success

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
- **AND** browser `alert()` SHALL NOT be used

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

### Requirement: Admin shell primitives and functional search

Admin-web SHALL provide reusable primitives (`TableShell`, `EmptyState`, `Pagination`, `PageHeader`, `ConfirmDialog`, `SearchInput`, `BulkBar`) sharing `--koola-*` tokens, a functional topbar search that navigates to `GET /admin/users` or `GET /admin/messages/search`, and bulk action bars on business and user tables.

#### Scenario: Functional topbar search
- **WHEN** an admin types in the topbar and submits
- **THEN** the app SHALL navigate to the appropriate search results (users or messages) and SHALL be keyboard operable

#### Scenario: Primitives share tokens
- **WHEN** any new page renders its table/empty/pagination/dialog
- **THEN** styling SHALL use `--koola-*` tokens without introducing a new design system

