## MODIFIED Requirements

### Requirement: User can add emoji reaction to a message

The system SHALL allow any conversation member to add or change one of 6 fixed emoji reactions (👍❤️😆😮😢😠) to any message, with explicit-set semantics. Each user can have at most one reaction per message. The endpoint body SHALL be `{ emoji: string | null }` where a string sets/replaces the user's reaction and `null` clears it. The same body SHALL produce the same end state regardless of how many times it is sent (idempotent), enabling safe outbox retries.

**BREAKING CHANGE**: replaces the previous toggle semantics. Old clients sending `{ emoji: '👍' }` to add and the same body to remove will now ALWAYS end in the "set" state and never auto-clear. Pre-launch app — no production clients to coordinate.

#### Scenario: Set reaction explicitly

- **WHEN** the user taps an emoji on a message and the client sends `POST /messages/:id/reactions` with body `{ emoji: '👍' }`
- **THEN** the backend SHALL replace any existing reaction by this user on this message with `'👍'` (or insert if none existed)
- **AND** the backend SHALL broadcast the new state via the `message_reaction` socket event
- **AND** sending the same body again SHALL produce no change in stored state

#### Scenario: Clear reaction explicitly

- **WHEN** the user taps the same emoji they already reacted with and the client sends `POST /messages/:id/reactions` with body `{ emoji: null }`
- **THEN** the backend SHALL remove this user's reaction from the message
- **AND** the backend SHALL broadcast the removal via the `message_reaction` socket event
- **AND** sending `{ emoji: null }` again on a message with no existing reaction SHALL be a no-op (still 200 OK)

#### Scenario: Replace reaction with a different emoji

- **WHEN** the user taps a different emoji than their current reaction and the client sends `{ emoji: '❤️' }`
- **THEN** the backend SHALL replace the previous reaction with `'❤️'`
- **AND** the backend SHALL broadcast the new state

#### Scenario: Outbox retry is safe

- **GIVEN** the mobile outbox sends `{ emoji: '👍' }` and the response is lost mid-flight
- **WHEN** the outbox retries with the same body
- **THEN** the final stored reaction SHALL still be `'👍'` (not toggled off)
- **AND** the broadcast SHALL be coalesced or idempotent at the gateway layer (no flapping)

### Requirement: Reactions displayed under message bubble

The system SHALL display reactions below each message bubble as a row of emoji with count (e.g., "👍2 ❤️1"). If no reactions exist, nothing is displayed. The display SHALL update in response to `message_reaction` socket events, including reactions that arrive from the user's own outbox-driven send (so optimistic UI is consistent with server state).

#### Scenario: Multiple users react

- **WHEN** 3 users react with 👍 and 1 user reacts with ❤️
- **THEN** the display shows "👍3 ❤️1" below the message bubble

#### Scenario: No reactions

- **WHEN** a message has no reactions
- **THEN** no reaction row is displayed

#### Scenario: Reaction cleared via null body

- **GIVEN** the message currently shows "👍2"
- **WHEN** one of the two users sends `{ emoji: null }` and the backend broadcasts the cleared reaction
- **THEN** the display updates to "👍1"
- **AND** if the second user also clears, the entire reactions row disappears

## REMOVED Requirements

### Requirement: Toggle off reaction

**Reason**: Replaced by explicit-clear semantics (`{ emoji: null }`). Toggle is non-idempotent and incompatible with the mobile outbox retry path; the outbox dispatcher cannot tell whether a retry of an "add" is fresh or duplicate, and a duplicate dispatch would silently flip the user's reaction state.

**Migration**: Mobile clients SHALL send `{ emoji: null }` to clear the user's existing reaction. The backend has no transitional code path; pre-launch break.

### Requirement: Change reaction

**Reason**: Folded into the explicit-set semantics on the merged `Requirement: User can add emoji reaction to a message`. "Change" is no longer a distinct operation — every set replaces.

**Migration**: Mobile clients send the new emoji as `{ emoji: '<new>' }`; backend replaces the prior value. No client-side toggle computation.
