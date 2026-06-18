## ADDED Requirements

### Requirement: Account Type Discriminator
The system SHALL extend the `User` model with an `accountType` field that is one of `personal` or `business`, defaulting to `personal` for all existing and newly registered users.

#### Scenario: Existing users default to personal
- **WHEN** a pre-existing `User` document without `accountType` is loaded
- **THEN** the system SHALL treat it as `accountType: 'personal'` and reading the field SHALL NOT throw

#### Scenario: New personal registration is personal
- **WHEN** a user registers through the normal registration flow
- **THEN** the created `User` SHALL have `accountType: 'personal'`

### Requirement: Business Account Ownership
A `business` account SHALL be a `User` document with `ownerUserId` referencing the root personal `User` that owns it. A `personal` account SHALL NOT have `ownerUserId`.

#### Scenario: Business account carries owner
- **WHEN** a business account is created
- **THEN** its `ownerUserId` SHALL equal the id of the creating personal (root) user

#### Scenario: Personal account has no owner
- **WHEN** a personal user is inspected
- **THEN** `ownerUserId` SHALL be absent/null

### Requirement: Credential-less Business Accounts
A `business` account SHALL be a valid `User` document without `email` or `passwordHash`. The system SHALL enforce `email` and `passwordHash` presence ONLY for `accountType: 'personal'`, validated at the service layer rather than via schema-level `required`.

#### Scenario: Business account created without credentials
- **WHEN** a business account is created with no `email` and no `passwordHash`
- **THEN** the document SHALL persist successfully and SHALL NOT be rejected by schema validation

#### Scenario: Personal account still requires credentials
- **WHEN** a personal user is created without an email or password
- **THEN** the service SHALL reject the operation with a validation error

#### Scenario: Multiple credential-less businesses coexist
- **WHEN** two or more business accounts exist with no `email`
- **THEN** the unique email index SHALL be sparse so the missing-email documents do not collide

### Requirement: Email Index Sparse Uniqueness
The system SHALL ensure the `email` uniqueness constraint is a unique sparse index defined via `schema.index()` (not via a duplicate `@Prop({ unique: true })` flag) so that documents missing `email` are excluded from the uniqueness check.

#### Scenario: Index excludes missing email
- **WHEN** the `User` collection contains business documents with no `email` field
- **THEN** index creation SHALL succeed without uniqueness violations and without a duplicate-index warning

### Requirement: Business Profile Fields
A `business` account SHALL carry the profile fields `businessCategory` (string), `province` (string), `relationshipType` (`partner` | `supplier`), `tagline` (string), `description` (string), `address` (string), `website` (string), `contactEmail` (string), `contactPhone` (string), `logoKey` (string, MinIO media key), and `licenseImageKey` (string, MinIO media key for the business-license image). These fields SHALL be absent on `personal` accounts.

#### Scenario: Business fields persist round-trip
- **WHEN** a business account is created with the profile fields and then re-read
- **THEN** all provided profile fields SHALL be returned unchanged

#### Scenario: Personal account omits business fields
- **WHEN** a personal user is read
- **THEN** the business profile fields SHALL be absent

### Requirement: Verification Status
A `business` account SHALL carry `verificationStatus` (one of `pending`, `verified`, `rejected`, default `pending`) and an optional `rejectionReason` string. A newly created business account SHALL be `pending`.

#### Scenario: New business is pending
- **WHEN** a business account is created
- **THEN** its `verificationStatus` SHALL be `pending` and `rejectionReason` SHALL be absent

#### Scenario: Verified discovery eligibility
- **WHEN** a business account has `verificationStatus: 'verified'`
- **THEN** it SHALL be eligible to appear in the Kết nối discovery surface

### Requirement: Ban Flag
A `User` SHALL carry `isBanned` (boolean, default `false`). This change SHALL only initialize and read the flag; flipping it is owned by the `admin-web-platform` change.

#### Scenario: Default not banned
- **WHEN** any account is created
- **THEN** `isBanned` SHALL default to `false`

### Requirement: Identity Indexes
The system SHALL define indexes on `accountType`, `ownerUserId`, and the business discovery filter fields (`relationshipType`, `province`, `businessCategory`) plus `verificationStatus`, using `schema.index()` declarations.

#### Scenario: Owned-accounts query is indexed
- **WHEN** the system queries business accounts by `ownerUserId`
- **THEN** the query SHALL use the `ownerUserId` index

#### Scenario: Discovery query is indexed
- **WHEN** the system queries verified business accounts filtered by `relationshipType`, `province`, or `businessCategory`
- **THEN** the relevant indexes SHALL support the filter
