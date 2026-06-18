## MODIFIED Requirements

### Requirement: JWT Token Payload
The system SHALL include the user's phone in the JWT access token payload, and SHALL additionally support an optional `act` (actor) claim and an `accountType` claim to support delegated business-account sessions. When a token represents a business-account session, `sub` is the business account id and `act` is the root human user id. JWT validation SHALL expose an `actorId` resolved as `act ?? sub`.

#### Scenario: Access token contains phone
- **WHEN** system generates a JWT access token for a personal login
- **THEN** the token payload SHALL contain `{ sub: userId, phone: userPhone }` and MAY include `accountType: 'personal'`

#### Scenario: Delegated business-account token
- **WHEN** the system issues a token for an account switch into a business account
- **THEN** the payload SHALL contain `{ sub: businessAccountId, act: rootUserId, accountType: 'business' }`

#### Scenario: JWT strategy validation
- **WHEN** system validates a JWT token
- **THEN** system SHALL extract the active identity from `sub` and SHALL expose `actorId = act ?? sub`

#### Scenario: Backward-compatible legacy token
- **WHEN** system validates a token that has no `act` claim
- **THEN** `actorId` SHALL equal `sub` and existing behavior SHALL be unchanged

### Requirement: User Schema
The system SHALL store user records with phone as the primary identifier and email as optional, and SHALL support an `accountType` discriminator (`personal` | `business`, default `personal`). The `email` and `passwordHash` fields SHALL be required only for `personal` accounts (enforced at the service layer), and the `email` unique index SHALL be sparse so credential-less business accounts do not collide.

#### Scenario: Phone field uniqueness
- **WHEN** a user record is created with a phone number
- **THEN** the phone field SHALL have a unique sparse index ensuring no duplicate phone numbers

#### Scenario: Email field optional
- **WHEN** a user registers with phone number only (no email)
- **THEN** the email field SHALL be null/undefined and the sparse unique index SHALL allow multiple null values

#### Scenario: Business account without credentials
- **WHEN** a business account is created with no `email` and no `passwordHash`
- **THEN** the document SHALL be valid and the sparse unique email index SHALL permit multiple such documents

#### Scenario: Personal account requires credentials
- **WHEN** a personal user creation is attempted without email or password
- **THEN** the service SHALL reject it with a validation error
