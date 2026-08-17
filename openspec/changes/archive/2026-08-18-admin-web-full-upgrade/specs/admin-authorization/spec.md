## ADDED Requirements

### Requirement: Admin mutation throttling uses named throttlers

`GET /admin/*` read routes and `POST /admin/*` mutation routes SHALL use named throttler buckets (`short`/`long`) consistent with `app.module.ts:ThrottlerModule` configuration. A bare `@SkipThrottle()` with no args SHALL NOT be used on admin routes; when skipping is needed the decorator SHALL explicitly list bucket names.

#### Scenario: Mutations are rate-limited
- **WHEN** an admin exceeds the mutation rate limit for a named bucket
- **THEN** the system SHALL return 429

#### Scenario: Named skip is explicit
- **WHEN** a route needs to skip throttling
- **THEN** the annotation SHALL explicitly name the buckets rather than relying on no-arg behavior
