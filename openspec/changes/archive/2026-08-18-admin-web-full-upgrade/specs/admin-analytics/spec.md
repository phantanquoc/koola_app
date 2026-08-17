## ADDED Requirements

### Requirement: Real platform analytics

The system SHALL expose `GET /admin/analytics` (AdminGuard) returning real aggregations over `range` query (`7d`|`30d`|`90d`): user growth (daily signups), message activity (daily count), conversation creation, story creation, and verification funnel (pending/verified/rejected counts over time). Data SHALL be derived from live collections, not static mocks.

#### Scenario: Analytics returns time-series
- **WHEN** an admin calls `GET /admin/analytics?range=7d`
- **THEN** the response SHALL contain daily buckets for users, messages, conversations, stories within the requested window

#### Scenario: Non-admin blocked
- **WHEN** a non-admin calls `GET /admin/analytics`
- **THEN** the system SHALL return 403

#### Scenario: Frontend renders without heavy chart deps
- **WHEN** admin-web Analytics page loads
- **THEN** it SHALL render time-series via lightweight SVG sparklines/bars and degrade to tables when data is empty
