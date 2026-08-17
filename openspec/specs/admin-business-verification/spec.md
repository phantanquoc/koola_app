# admin-business-verification Specification

## Purpose
TBD - created by archiving change admin-web-platform. Update Purpose after archive.
## Requirements
### Requirement: List Pending Business Accounts
The system SHALL expose `GET /admin/businesses/pending` (JWT + AdminGuard) returning a paginated list of `User` documents where `accountType='business'` and `verificationStatus='pending'`. Each item SHALL include the business profile fields and a temporary download URL for the `licenseImageKey` (via the media presigned-URL flow) so the admin can view the business-license image.

#### Scenario: Pending businesses listed with license URL
- **WHEN** an admin calls `GET /admin/businesses/pending`
- **THEN** the system SHALL return only pending business accounts, each including profile fields and a `licenseImageUrl` derived from `licenseImageKey`

#### Scenario: Missing license image
- **WHEN** a pending business has no `licenseImageKey`
- **THEN** the item's `licenseImageUrl` SHALL be `null` and the media service SHALL NOT be called for it

#### Scenario: Pagination
- **WHEN** there are more pending businesses than the page size
- **THEN** the response SHALL be paginated with a cursor or page indicator consistent with the project's list conventions

#### Scenario: Non-pending excluded
- **WHEN** a business is `verified` or `rejected`
- **THEN** it SHALL NOT appear in the pending list

### Requirement: Approve Business Account
The system SHALL expose `POST /admin/businesses/:id/approve` (JWT + AdminGuard) that sets the target business account's `verificationStatus` to `verified` and clears any `rejectionReason`.

#### Scenario: Successful approval
- **WHEN** an admin approves a pending business account
- **THEN** its `verificationStatus` SHALL become `verified`, `rejectionReason` SHALL be cleared, and it SHALL become eligible for Kết nối discovery

#### Scenario: Approve a non-business is rejected
- **WHEN** the target id is not a business account
- **THEN** the system SHALL return HTTP 404 Not Found

### Requirement: Reject Business Account
The system SHALL expose `POST /admin/businesses/:id/reject` (JWT + AdminGuard) accepting a validated body `{ rejectionReason }` (required, bounded length) that sets `verificationStatus` to `rejected` and stores the reason.

#### Scenario: Successful rejection with reason
- **WHEN** an admin rejects a pending business with a non-empty `rejectionReason`
- **THEN** its `verificationStatus` SHALL become `rejected` and the `rejectionReason` SHALL be stored

#### Scenario: Rejection without reason is invalid
- **WHEN** an admin submits a reject request with a missing or empty `rejectionReason`
- **THEN** the system SHALL return HTTP 400 Bad Request and SHALL NOT change the account

#### Scenario: Reject a non-business is rejected
- **WHEN** the target id is not a business account
- **THEN** the system SHALL return HTTP 404 Not Found

### Requirement: Verification queue supports efficient discovery
The pending business queue SHALL provide sufficient search, filter, and pagination controls for a reviewer to locate and resume work.

#### Scenario: Reviewer filters the queue
- **WHEN** the reviewer applies supported text, category, province, or status criteria
- **THEN** the queue SHALL show matching records and an explicit active-filter state
- **AND** filters SHALL remain stable while opening and closing a review

#### Scenario: No businesses match
- **WHEN** filters produce no records
- **THEN** the queue SHALL show an empty state with a clear-filters action

### Requirement: License evidence remains in review context
The verification workflow SHALL allow the reviewer to inspect available license evidence without losing the target business and queue context.

#### Scenario: Reviewer opens license evidence
- **WHEN** a pending business has a `licenseImageUrl`
- **THEN** the review workspace SHALL show an in-context preview with an option to inspect the original safely
- **AND** returning from inspection SHALL preserve queue position and filters

#### Scenario: License evidence is missing or expired
- **WHEN** the evidence URL is null, expired, or fails to load
- **THEN** the review workspace SHALL state the condition and expose an allowed refresh/recovery action
- **AND** it SHALL not present a broken image as valid evidence

### Requirement: Verification decisions are explicit
Approve and reject actions SHALL present a clear decision lifecycle and SHALL not silently remove the business before the reviewer sees confirmed completion.

#### Scenario: Reviewer approves a business
- **WHEN** the reviewer chooses approve
- **THEN** the UI SHALL identify the business and require an explicit confirmation
- **AND** after server success, show completion feedback before or while updating the queue

#### Scenario: Approve requires confirmation dialog
- **WHEN** the reviewer clicks the approve button
- **THEN** a confirmation dialog SHALL appear before the API call is made
- **AND** the approve action SHALL NOT fire immediately without user confirmation

#### Scenario: Reviewer rejects a business
- **WHEN** the reviewer chooses reject
- **THEN** a bounded non-empty reason SHALL remain required
- **AND** duplicate submission SHALL be disabled while pending

#### Scenario: Verification request fails
- **WHEN** approve or reject fails
- **THEN** the review context, evidence, and rejection reason SHALL remain available
- **AND** the reviewer SHALL receive an actionable error

### Requirement: Bulk verification operations

`POST /admin/businesses/bulk-approve` and `POST /admin/businesses/bulk-reject` SHALL accept `{ ids: string[], rejectionReason?: string }` and apply approve/reject to each business account atomically per-item (partial success permitted with per-item result), each item SHALL write an audit entry.

#### Scenario: Bulk approve
- **WHEN** an admin posts `{ ids: ["id1","id2"] }` to `POST /admin/businesses/bulk-approve`
- **THEN** each valid business SHALL become `verified` and the response SHALL contain per-item status

#### Scenario: Bulk reject requires reason
- **WHEN** an admin posts to `POST /admin/businesses/bulk-reject` without `rejectionReason`
- **THEN** the system SHALL return 400 and SHALL NOT change any account

