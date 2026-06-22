## ADDED Requirements

### Requirement: Admin reusable UI primitives
Admin web UI modernization SHALL extract repeated page-level patterns into small reusable primitives before expanding visual complexity.

#### Scenario: Admin metric card pattern repeats
- **WHEN** dashboard KPI cards share structure and visual behavior
- **THEN** the admin web app SHALL provide a reusable metric-card primitive or equivalent component pattern

#### Scenario: Admin status badge pattern repeats
- **WHEN** users, businesses, or dashboard panels present status values
- **THEN** the admin web app SHALL use a consistent status badge primitive or mapping rather than ad-hoc badge markup per page

#### Scenario: Admin table pattern repeats
- **WHEN** users or businesses pages render paginated operational tables
- **THEN** the admin web app SHALL use a consistent table shell, loading state, empty state, and pagination pattern

### Requirement: Admin dashboard action hierarchy
The admin dashboard SHALL make operational attention areas obvious before secondary analytics.

#### Scenario: Pending verification exists
- **WHEN** there are pending business verification items
- **THEN** the dashboard SHALL make the pending workload visible and provide a clear path to the business verification queue

#### Scenario: Dashboard data is loading
- **WHEN** admin dashboard metrics are loading
- **THEN** loading placeholders SHALL match the expected dashboard layout closely enough to avoid layout shift

#### Scenario: Dashboard data fails to load
- **WHEN** admin dashboard metrics fail to load
- **THEN** the dashboard SHALL present an error state with a recovery action rather than showing stale or empty-looking content

### Requirement: Admin responsive and accessible operations shell
Admin web UI polish SHALL preserve responsive usability and accessibility for navigation, actions, and operational tables.

#### Scenario: Admin viewport is narrow
- **WHEN** the admin web app is viewed on a narrow viewport supported by the current responsive design
- **THEN** navigation and primary page actions SHALL remain usable without hiding critical operations

#### Scenario: Admin interactive control is icon-only
- **WHEN** admin UI uses an icon-only or compact action control
- **THEN** the control SHALL have an accessible label or visible text alternative
