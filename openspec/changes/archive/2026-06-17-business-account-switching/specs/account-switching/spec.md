## ADDED Requirements

### Requirement: List Owned Accounts
The system SHALL expose `GET /accounts` returning the authenticated caller's root personal account plus all business accounts whose `ownerUserId` equals the resolved root id. Each entry SHALL include `_id`, `accountType`, `displayName`, `avatar`/`logoKey`, and (for business accounts) `verificationStatus`.

#### Scenario: Root lists personal and businesses
- **WHEN** a personal user with two owned business accounts calls `GET /accounts`
- **THEN** the response SHALL contain three entries: the personal account and the two business accounts with their `verificationStatus`

#### Scenario: Caller in a business context still lists by root
- **WHEN** a caller whose access token has `act` (acting as a business) calls `GET /accounts`
- **THEN** the system SHALL resolve the root id from `act` and return the same root-scoped list

### Requirement: Switch Account Token Issuance
The system SHALL expose `POST /accounts/switch` accepting `{ targetAccountId }`. It SHALL resolve the root id as `token.act ?? token.sub`, and SHALL issue a NEW access token `{ sub: targetAccountId, act: rootUserId, accountType }` when the target is permitted. The root refresh token SHALL NOT be rotated by this operation.

#### Scenario: Switch into an owned business
- **WHEN** the caller's resolved root owns the target business account
- **THEN** the system SHALL return a new access token with `sub = targetAccountId` and `act = rootUserId`

#### Scenario: Switch back to personal
- **WHEN** `targetAccountId` equals the resolved root id
- **THEN** the system SHALL return a new access token with `sub = rootUserId` (acting as personal)

#### Scenario: Switch into a non-owned account is rejected
- **WHEN** the target account's `ownerUserId` does not equal the resolved root id and the target is not the root itself
- **THEN** the system SHALL return HTTP 403 Forbidden

#### Scenario: Switch into a banned account is rejected
- **WHEN** the target account has `isBanned: true`
- **THEN** the system SHALL return HTTP 403 Forbidden

#### Scenario: Refresh token unchanged on switch
- **WHEN** a switch succeeds
- **THEN** the root refresh token SHALL remain valid and unrotated

### Requirement: JWT Actor Claim Propagation
The system SHALL extend the JWT access payload with an optional `act` (actor) claim and an `accountType` claim, and `JwtStrategy.validate` SHALL expose `actorId = payload.act ?? payload.sub` alongside the existing identity fields.

#### Scenario: Delegated token exposes actor
- **WHEN** a request carries a token with `sub = businessId` and `act = rootId`
- **THEN** `validate` SHALL return `id = businessId` and `actorId = rootId`

#### Scenario: Legacy token without act
- **WHEN** a request carries a token without `act`
- **THEN** `validate` SHALL return `actorId` equal to `sub` (backward compatible)

### Requirement: Token Lifecycle Recovery In Business Context
The client SHALL persist the active account id durably, keep the access token in memory, and anchor the durable refresh token to the root user. On an expired business-context access token, the client SHALL refresh the root access token, then re-mint the business access token via `POST /accounts/switch` before retrying the original request.

#### Scenario: 401 recovery while acting as business
- **WHEN** a business-context request fails with 401 and the stored active account is a business account
- **THEN** the client SHALL call `/auth/refresh` (root), then `/accounts/switch` for the active account, then retry the original request with the new business token

#### Scenario: Session restore reopens last active account
- **WHEN** the app restores a session and a business account id was the last active account
- **THEN** the client SHALL refresh the root token and switch into that business account before initializing local state

#### Scenario: Switch failure during recovery falls back to personal
- **WHEN** the re-mint switch fails during recovery
- **THEN** the client SHALL fall back to the root personal account, clear the stored active account, and SHALL NOT retry indefinitely

### Requirement: Mobile Clean Switch Engine
The client `switchAccount(targetId)` SHALL tear down the current account's local-first wiring, sockets, and SQLite, then re-initialize all of them under the target account id, mirroring the logout→login ordering, WITHOUT clearing the root refresh token.

#### Scenario: Clean teardown and re-init on switch
- **WHEN** the user switches from account A to account B
- **THEN** account A's local-first wiring, outbox processing, socket, webrtc, and SQLite connection SHALL be torn down, and account B's `currentUserId`, SQLite (`initDb(B)`), local-first wiring, socket, and webrtc SHALL be initialized

#### Scenario: No cross-account data bleed
- **WHEN** a switch to account B completes
- **THEN** the active SQLite database SHALL be account B's, enforced by the `dbInit` cross-account guard, and no account A listeners SHALL remain registered

### Requirement: Active Call Blocks Switching
The client SHALL block account switching while a call is active or ringing and SHALL inform the user to end the call first.

#### Scenario: Switch blocked during a call
- **WHEN** the user attempts to switch accounts while a call is active or ringing
- **THEN** the switch SHALL be aborted and the message "Hãy kết thúc cuộc gọi trước" SHALL be shown

### Requirement: Socket Auth Allows Same-Root Switch
The realtime gateways SHALL accept a socket re-authentication (`auth:refresh`) when the new token represents an account owned by the same root actor as the current connection, not only when the `sub` is identical. A token belonging to a different human SHALL still be rejected.

#### Scenario: Re-auth to an owned account is accepted
- **WHEN** a connected socket sends `auth:refresh` with a token whose `act` matches the current actor/owner
- **THEN** the gateway SHALL accept the new token and update the socket's identity

#### Scenario: Re-auth to a foreign identity is rejected
- **WHEN** a connected socket sends `auth:refresh` with a token whose actor/owner differs from the current connection
- **THEN** the gateway SHALL reject it with an auth error
