## ADDED Requirements

### Requirement: TurnService fails fast without TURN_STATIC_SECRET in production
The `TurnService` constructor SHALL throw `Error('TURN_STATIC_SECRET must be set for production safety')` when `this.configService.get('TURN_STATIC_SECRET')` returns an empty string, undefined, or null AND `process.env.NODE_ENV !== 'test'`. This prevents the backend from booting with deterministic HMAC credentials that attackers could forge.

#### Scenario: Production deployment without secret
- **GIVEN** `NODE_ENV=production` (or any value other than `test`)
- **AND** `TURN_STATIC_SECRET` is not set in the environment
- **WHEN** Nest attempts to instantiate `TurnService`
- **THEN** the constructor throws `Error` with message `TURN_STATIC_SECRET must be set for production safety`
- **AND** the application fails to start

#### Scenario: Production deployment with empty string secret
- **GIVEN** `NODE_ENV=production`
- **AND** `TURN_STATIC_SECRET=` (empty string)
- **WHEN** Nest attempts to instantiate `TurnService`
- **THEN** the constructor throws `Error`
- **AND** the application fails to start

#### Scenario: Production deployment with valid secret
- **GIVEN** `NODE_ENV=production`
- **AND** `TURN_STATIC_SECRET` is a non-empty string
- **WHEN** Nest instantiates `TurnService`
- **THEN** the constructor completes without throwing
- **AND** the service is available for DI

### Requirement: TurnService allows empty secret when NODE_ENV=test
The `TurnService` constructor SHALL NOT throw when `TURN_STATIC_SECRET` is unset or empty AND `process.env.NODE_ENV === 'test'`. This enables unit tests and CI to run without requiring a real secret.

#### Scenario: Test environment with no secret
- **GIVEN** `NODE_ENV=test`
- **AND** `TURN_STATIC_SECRET` is not set
- **WHEN** Nest instantiates `TurnService` during a test suite
- **THEN** the constructor completes without throwing
- **AND** tests can proceed
- **AND** the HMAC credentials produced will be based on empty secret (acceptable in test)

#### Scenario: Test environment with explicit test secret
- **GIVEN** `NODE_ENV=test`
- **AND** `TURN_STATIC_SECRET=test-secret-not-for-prod`
- **WHEN** Nest instantiates `TurnService`
- **THEN** the constructor completes without throwing

### Requirement: TurnService generates time-limited HMAC credentials
The `TurnService.generateCredentials(targetUserId)` method SHALL produce a `username` of form `<expiryEpochSeconds>:<targetUserId>` and a `password` that is the base64-encoded HMAC-SHA1 of the username signed with the configured `TURN_STATIC_SECRET`. The expiry SHALL be `now + 3600 seconds`.

#### Scenario: Credentials have 1-hour TTL
- **GIVEN** `TurnService` is instantiated with a valid secret
- **WHEN** `generateCredentials('user-123')` is called at epoch time `T`
- **THEN** the returned `username` equals `${T + 3600}:user-123`
- **AND** the returned `password` is the base64 HMAC-SHA1 of the username using the secret

#### Scenario: ICE servers include STUN and TURN URLs
- **WHEN** `getIceServers('user-123')` is called
- **THEN** the result includes a STUN entry `stun:<host>:<port>`
- **AND** a TURN entry `turn:<host>:<port>` with the generated username and credential

### Requirement: Missing secret is documented in .env.example
The `chat-backend/.env.example` file SHALL include a `TURN_STATIC_SECRET=` line with a comment explaining that the value must be set to a strong random string in production and that an empty value causes startup to fail.

#### Scenario: Developer reads .env.example
- **WHEN** a developer inspects `chat-backend/.env.example`
- **THEN** the file contains a `TURN_STATIC_SECRET` entry
- **AND** a nearby comment explains that it is required in non-test environments
