# webrtc-call-timeout-reliability Specification

## Purpose
TBD - created by archiving change fix-miss-call-reliability. Update Purpose after archive.
## Requirements
### Requirement: Zero process-local call timeout state in WebrtcGateway
`WebrtcGateway` SHALL hold no process-local call timeout state and SHALL schedule no call-lifetime timer; every answered-vs-missed decision SHALL be made by inspecting Redis session state and the shared deadline schedule.

#### Scenario: Gateway contains no timer state after adoption
- **WHEN** the gateway module is loaded in any pod after this change is deployed
- **THEN** the source of `webrtc.gateway.ts` contains zero `setTimeout`, `clearTimeout`, or `Map`/`Set`-based timeout bookkeeping for calls

#### Scenario: Terminal handling does not clear process-local timers
- **WHEN** `call_accept`, `call_decline`, `call_cancel`, `call_end`, `call_failed`, or `handleDisconnect` settles a session
- **THEN** the gateway does NOT invoke any per-session `clearTimeout`/Map deletion — it only mutates Redis state so the deadline schedule reflects that the session is no longer missable

### Requirement: Per-session deadline recorded at creation and used as cron eligibility
Every session created by `call_initiate` SHALL carry `deadlineAt` (milliseconds since epoch). The online branch SHALL set `deadlineAt = createdAt + 30_000`; the offline-push branch (FCM sent) SHALL set `deadlineAt = createdAt + 25_000`. The cron SHALL treat a session as eligible for miss/timeout only when **both** `state === 'initiated'` and `Number(deadlineAt) <= now`. The stored value and the `initiated_sessions` sorted-set score SHALL be kept in agreement so the cron can pre-filter efficiently via `zrangebyscore`.

#### Scenario: Online call receives the 30 s deadline
- **WHEN** `call_initiate` targets an online peer and the session is created
- **THEN** the `call:<id>` hash field `deadlineAt` is persisted as epoch ms equal to `createdAt + 30_000`
- **AND** the `initiated_sessions` entry carries the same `deadlineAt` score

#### Scenario: Offline-push call receives the 25 s deadline
- **WHEN** `call_initiate` targets an offline peer that has FCM tokens and the push path is taken
- **THEN** the session's `deadlineAt` is persisted as epoch ms equal to `createdAt + 25_000`

#### Scenario: Immediate-missed fallback produces no deadline-eligible session
- **WHEN** the target is offline with zero FCM tokens and the session is immediately ended as `missed`
- **THEN** no miss/timeout is subsequently produced by the cron for that session

### Requirement: Single source of truth cron that produces exactly the old timer effects, exactly once across pods
The existing `@Cron('*/15 * * * * *')` cadence SHALL be retained and SHALL become the single producer of `call_missed` (to `user:<initiatorId>`) and `call_timeout` (to `user:<targetUserId>`) for expired-to-missed sessions, along with the matching `updateSessionState('missed')` transition, `updateLog({status:'missed', duration:0, endedAt})`, and `pending_call:<targetUserId>` cleanup. A per-session **atomic claim** SHALL gate the entire effect so two cron shards that observe the same expired entry in the same tick produce exactly one set of emits, state transitions, and log writes; the loser SHALL treat the session as already handled and SHALL NOT emit.

#### Scenario: Expired online session is missed exactly once
- **WHEN** a session with an online 30 s deadline passes its `deadlineAt` without a terminal handler having promoted it off `initiated_sessions`, and the next cron tick runs on two pods simultaneously
- **THEN** exactly one pod executes the claim, marks the session `missed`, updates the call log to `missed`, deletes `pending_call:<targetUserId>` if any, emits `call_missed {sessionId, reason:'No answer'}` to the initiator room, and emits `call_timeout {sessionId}` to the target room
- **AND** the other pod emits nothing and does not mutate the session

#### Scenario: Settled session is never touched by the cron
- **WHEN** `call_accept`, `call_decline`, `call_cancel`, `call_end`, `call_failed`, or an `handleDisconnect` auto-end has already moved the session out of `state === 'initiated'` (and therefore off `initiated_sessions`)
- **THEN** subsequent cron ticks SHALL NOT mark the session `missed`, SHALL NOT emit `call_missed`/`call_timeout`, and SHALL NOT update the call log for that `sessionId`

#### Scenario: Cron emits mirror the removed timer contract
- **WHEN** an online call is not answered before its deadline or an offline-push call is not answered within its grace
- **THEN** the cron-emitted `call_missed` payload uses the same shape as the former `setTimeout` callbacks: `{sessionId, reason:'No answer'}` to the initiator and `{sessionId}` on `call_timeout` to the target

### Requirement: Terminal handlers leave no timeable state for the cron
Every terminal transition handled by `updateSessionState`/`endSession` (`call_accept`, `call_decline`, `call_cancel`, `call_end`, `call_failed`, and the `handleDisconnect` auto-end path) SHALL leave the session in a state and sorted-set presence such that the cron will never consider it eligible for miss/timeout, and SHALL clear any transient timeout bookkeeping (the former `call_timeout:<id>` key) and the associated `pending_call:<targetUserId>` entry if it references that session.

#### Scenario: Accept tears down the timeout
- **WHEN** `call_accept` transitions a session to `active`
- **THEN** the session is removed from the `initiated_sessions` score space and any `call_timeout:<id>` leaf is deleted, so the cron skips it on subsequent ticks, and any `pending_call:<targetUserId>` that references this session is deleted

#### Scenario: Any aborting signal tears down the timeout
- **WHEN** `call_decline`, `call_cancel`, `call_end`, `call_failed`, or the disconnect auto-end path terminates the session
- **THEN** the same teardown holds: the cron SHALL NOT later emit `call_missed`/`call_timeout` for that `sessionId`

### Requirement: SDP/ICE signaling surfaces explicit errors instead of silent drops
When the sender of `call_offer`, `call_answer`, or `call_ice_candidate` fails `validateParticipant(sessionId, senderId)` (session absent or sender no longer a participant), the gateway SHALL emit an `error` event to the **sender's socket** with `{code: 410, message: 'Session has ended or you are no longer a participant'}` instead of silently dropping the message. The gateway SHALL NOT relay the offer/answer/candidate to any other party in this case. The message text is normative so the client can map it to state cleanup without guessing.

#### Scenario: Offer sent after session ended
- **GIVEN** a session was settled as `missed`/`cancelled`/`ended` no earlier than the sender's local state update (race window)
- **WHEN** the sender emits `call_offer` for that session
- **THEN** the gateway emits `error {code: 410, message: 'Session has ended or you are no longer a participant'}` back to the sender and relays nothing

#### Scenario: ICE candidate sent after session ended
- **GIVEN** a peer sends `call_ice_candidate` for a session that has just been expired by the cron or ended by the other party
- **WHEN** `validateParticipant` returns false
- **THEN** the gateway emits `error {code: 410, message: 'Session has ended or you are no longer a participant'}` to the sender

#### Scenario: Valid signaling still relays unchanged
- **WHEN** `validateParticipant` returns true
- **THEN** the gateway relays the offer/answer/candidate exactly as before (no new `error` emitted)

