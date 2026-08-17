# admin-authorization Specification

## Purpose
TBD - created by archiving change admin-web-platform. Update Purpose after archive.
## Requirements
### Requirement: Platform Admin Flag
The system SHALL add an `isPlatformAdmin` boolean field (default `false`) to the `User` model as the single source of platform-administration authority.

#### Scenario: Default non-admin
- **WHEN** any user is created or an existing user is loaded without the field
- **THEN** `isPlatformAdmin` SHALL be `false` and reading it SHALL NOT throw

#### Scenario: Admin flag set out-of-band
- **WHEN** a user's `isPlatformAdmin` is set to `true` directly in the database
- **THEN** that user SHALL be recognized as a platform admin on subsequent requests

### Requirement: Admin Guard Authorizes The Human Actor
The system SHALL provide an `AdminGuard` that runs after JWT authentication and authorizes a request only when the resolved human actor (the root behind any business-switched session, i.e. `actorId = act ?? sub`) is a user with `isPlatformAdmin === true`. The guard SHALL load the actor user freshly from the database and SHALL NOT trust a stale token claim for the admin decision.

#### Scenario: Admin in personal context allowed
- **WHEN** a request carries a valid token whose subject is a personal admin user
- **THEN** the AdminGuard SHALL allow the request

#### Scenario: Admin in business-switched context allowed
- **WHEN** a request carries a valid token with `sub = businessId` and `act = adminRootId` where the root user has `isPlatformAdmin === true`
- **THEN** the AdminGuard SHALL allow the request (authority follows the human actor)

#### Scenario: Non-admin rejected
- **WHEN** a request carries a valid token whose resolved actor is not a platform admin
- **THEN** the AdminGuard SHALL reject the request with HTTP 403 Forbidden

#### Scenario: Revoked admin loses access immediately
- **WHEN** a user's `isPlatformAdmin` is set back to `false` and they make an admin request with a previously valid token
- **THEN** the AdminGuard SHALL reject with 403 because it re-reads the flag from the database

### Requirement: Admin Routes Protection
The system SHALL protect every route under `/admin/*` with both JWT authentication and the `AdminGuard`. No `/admin/*` route SHALL be public.

#### Scenario: Missing token rejected at JWT layer
- **WHEN** an unauthenticated request hits any `/admin/*` route
- **THEN** the system SHALL reject it with HTTP 401 Unauthorized

#### Scenario: Valid non-admin token rejected at admin layer
- **WHEN** an authenticated non-admin request hits any `/admin/*` route
- **THEN** the system SHALL reject it with HTTP 403 Forbidden

### Requirement: Admin Identity Endpoint
The system SHALL expose `GET /admin/me` (JWT + AdminGuard) returning the authenticated admin's safe identity, used by the admin web app to confirm admin authorization.

#### Scenario: Admin identity returned
- **WHEN** a platform admin calls `GET /admin/me`
- **THEN** the system SHALL return HTTP 200 with the admin's safe identity (no `passwordHash`, no `fcmTokens`)

#### Scenario: Non-admin gets 403
- **WHEN** a non-admin calls `GET /admin/me`
- **THEN** the system SHALL return HTTP 403 Forbidden

### Requirement: First Admin Bootstrap Without Self-Registration
The system SHALL NOT provide any endpoint to grant admin to oneself or to register an admin. The first admin SHALL be created only by setting `isPlatformAdmin` directly in the database.

#### Scenario: No self-grant endpoint exists
- **WHEN** the API surface is inspected
- **THEN** there SHALL be no endpoint that allows a caller to set their own or another user's `isPlatformAdmin` (admin promotion is out-of-band only)

### Requirement: Admin mutation throttling uses named throttlers

`GET /admin/*` read routes and `POST /admin/*` mutation routes SHALL use named throttler buckets (`short`/`long`) consistent with `app.module.ts:ThrottlerModule` configuration. A bare `@SkipThrottle()` with no args SHALL NOT be used on admin routes; when skipping is needed the decorator SHALL explicitly list bucket names.

#### Scenario: Mutations are rate-limited
- **WHEN** an admin exceeds the mutation rate limit for a named bucket
- **THEN** the system SHALL return 429

#### Scenario: Named skip is explicit
- **WHEN** a route needs to skip throttling
- **THEN** the annotation SHALL explicitly name the buckets rather than relying on no-arg behavior

