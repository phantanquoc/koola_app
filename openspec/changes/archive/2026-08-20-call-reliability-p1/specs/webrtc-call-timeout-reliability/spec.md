## ADDED Requirements

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
