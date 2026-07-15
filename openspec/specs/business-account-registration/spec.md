# business-account-registration Specification

## Purpose
TBD - created by archiving change business-account-switching. Update Purpose after archive.
## Requirements
### Requirement: Create Business Account
The system SHALL expose `POST /accounts/business` that creates a new `business` `User` owned by the authenticated caller's resolved root id, with `verificationStatus: 'pending'`. The request body SHALL be validated by a DTO covering `displayName` (business name), `businessCategory`, `province`, `relationshipType` (`partner`|`supplier`), `licenseImageKey`, and the optional fields `tagline`, `description`, `address`, `website`, `contactEmail`, `contactPhone`, `logoKey`.

#### Scenario: Successful creation
- **WHEN** a personal user submits a valid business creation request
- **THEN** the system SHALL create a business `User` with `accountType: 'business'`, `ownerUserId` equal to the caller's root id, and `verificationStatus: 'pending'`, returning the created account

#### Scenario: Missing required fields rejected
- **WHEN** the request omits any required field (business name, category, province, relationshipType, or licenseImageKey)
- **THEN** the system SHALL return HTTP 400 Bad Request with validation errors and SHALL NOT create an account

#### Scenario: Invalid relationship type rejected
- **WHEN** `relationshipType` is not `partner` or `supplier`
- **THEN** the system SHALL return HTTP 400 Bad Request

### Requirement: Owner Immediate Usability While Pending
A newly created business account SHALL be immediately usable by its owner (switchable into and able to operate) even while `verificationStatus` is `pending`.

#### Scenario: Owner switches into a pending business
- **WHEN** the owner creates a business account and immediately switches into it
- **THEN** the switch SHALL succeed and the owner SHALL operate as the business account despite `pending` status

#### Scenario: Pending business hidden from discovery
- **WHEN** a business account is `pending`
- **THEN** it SHALL NOT appear in the Kết nối discovery surface

### Requirement: Soft Per-Owner Limit
The system SHALL enforce a configurable maximum number of business accounts per owner (`MAX_BUSINESS_ACCOUNTS_PER_OWNER`, default 10). Creating beyond the limit SHALL be rejected with a clear error.

#### Scenario: Creation within limit
- **WHEN** an owner with fewer than the maximum business accounts creates another
- **THEN** the creation SHALL succeed

#### Scenario: Creation beyond limit rejected
- **WHEN** an owner who already holds the maximum number of business accounts attempts to create another
- **THEN** the system SHALL return HTTP 409 Conflict with a clear message and SHALL NOT create an account

### Requirement: Account List And Create UI
The Personal (Cá nhân) tab SHALL provide a "Danh sách tài khoản" screen listing the root personal account and all owned business accounts with their verification status, and an entry point to add a new business account via a form that reuses the prior create-business UX (name, category, province, relationship type, tagline, description, address, contacts), with logo and business-license image upload through the existing media upload flow. An image SHALL be considered uploaded only after that flow returns a persistent object key; the client SHALL NOT fabricate a key or report upload success for a local-only selection.

#### Scenario: Account list shows accounts and statuses
- **WHEN** the user opens "Danh sách tài khoản"
- **THEN** the screen SHALL list the personal account and each owned business account with a label reflecting its `verificationStatus`

#### Scenario: Create business from the list
- **WHEN** the user taps "Thêm tài khoản doanh nghiệp", completes the form (including uploading a logo and a business-license image), and submits
- **THEN** the client SHALL upload the images via the media flow, call `POST /accounts/business` with the confirmed object keys, and the new account SHALL appear in the list as `pending`

#### Scenario: Selecting an account switches into it
- **WHEN** the user selects an account from the list
- **THEN** the client SHALL perform the account switch (subject to the active-call guard)

#### Scenario: License selection is cancelled
- **WHEN** the user cancels the system picker without selecting a license image
- **THEN** the UI SHALL return to its prior state without reporting success or creating a license key

#### Scenario: License upload fails
- **WHEN** selection succeeds but the media upload fails
- **THEN** the UI SHALL show an actionable failure state
- **AND** business submission SHALL remain blocked unless a previously confirmed license key still exists

#### Scenario: License upload succeeds
- **WHEN** the media upload completes and returns a persistent object key
- **THEN** the UI SHALL show the uploaded state
- **AND** the exact returned key SHALL be used as `licenseImageKey`

#### Scenario: User submits while upload is active
- **WHEN** a required license upload is still in progress
- **THEN** the submit action SHALL remain disabled
- **AND** no business creation request SHALL be sent

