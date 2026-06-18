## ADDED Requirements

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
