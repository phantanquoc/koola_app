## ADDED Requirements

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
