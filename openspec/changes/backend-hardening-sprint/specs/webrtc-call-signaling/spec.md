## ADDED Requirements

### Requirement: Initiate Call Session
The system SHALL allow authenticated WebSocket clients to initiate a WebRTC call to another user in a shared conversation.

#### Scenario: Successful call initiation
- **WHEN** an authenticated user emits `call_initiate` with `{ targetUserId, conversationId, callType }` over WebSocket
- **THEN** the server creates a call session stored in Redis with `initiatorId`, `targetUserId`, `conversationId`, `callType`, `status: "ringing"`, and a TTL of 120 seconds; emits `incoming_call` to the target user; emits `call_created` with `sessionId` back to the initiator

#### Scenario: Target user not in shared conversation
- **WHEN** the initiator and target do not share the given conversationId
- **THEN** the server emits `call_error` to the initiator with `{ code: "NOT_IN_CONVERSATION", message: "Target user is not in this conversation" }` and does NOT create a session

#### Scenario: Initiator already in active call
- **WHEN** `call_initiate` is received and the initiator already has an active call session in the same conversation with the same target
- **THEN** the server emits `call_error` to the initiator with `{ code: "SESSION_EXISTS", message: "Active call already exists" }` and does NOT create a new session

### Requirement: Active-Session Deduplication Index
The system SHALL maintain a per-user Redis Set index of active call session IDs to enable O(1) duplicate-session detection without scanning the full Redis keyspace.

#### Scenario: Session created — index updated
- **WHEN** a call session is successfully created
- **THEN** the server adds the sessionId to the Redis Sets `active_calls:{initiatorId}` and `active_calls:{targetId}`, setting the Set TTL equal to the session TTL (120 seconds)

#### Scenario: Session ended — index cleaned
- **WHEN** a call session ends (either party hangs up, call is rejected, or session TTL expires)
- **THEN** the server removes the sessionId from `active_calls:{initiatorId}` and `active_calls:{targetId}` using SREM (idempotent)

#### Scenario: Duplicate detection uses O(1) lookup
- **WHEN** `hasExistingSession(userId, targetId, conversationId)` is called
- **THEN** the implementation MUST NOT use Redis `KEYS` or `SCAN` commands; it SHALL read `SMEMBERS active_calls:{userId}` and inspect only the hashes whose IDs appear in the Set

#### Scenario: Stale Set entry after crash
- **WHEN** the server process restarts without cleanly ending a session
- **THEN** the `active_calls:{userId}` Set TTL expires at the same time as the session hash TTL, leaving no orphaned index entries

### Requirement: Call Answer and Rejection
The system SHALL allow call targets to accept or reject incoming calls.

#### Scenario: Target accepts call
- **WHEN** the target user emits `call_answer` with `{ sessionId }` over WebSocket
- **THEN** the server updates session status to `"active"`, emits `call_answered` to the initiator

#### Scenario: Target rejects call
- **WHEN** the target user emits `call_reject` with `{ sessionId }` over WebSocket
- **THEN** the server ends the session, removes sessionId from both `active_calls` Sets, emits `call_rejected` to the initiator

#### Scenario: Call answer timeout
- **WHEN** the target does not respond within 120 seconds (session TTL)
- **THEN** the Redis session hash expires; the `active_calls` Sets also expire via matching TTL; the initiator receives `call_timeout` if still connected

### Requirement: Call Termination
The system SHALL allow either party to end an active call.

#### Scenario: Initiator ends call
- **WHEN** the initiator emits `call_end` with `{ sessionId }` over WebSocket
- **THEN** the server ends the session, removes sessionId from both `active_calls` Sets, emits `call_ended` to the target

#### Scenario: Target ends call
- **WHEN** the target user emits `call_end` with `{ sessionId }` over WebSocket
- **THEN** the server ends the session, removes sessionId from both `active_calls` Sets, emits `call_ended` to the initiator

#### Scenario: End non-existent session
- **WHEN** `call_end` is emitted with a sessionId that does not exist in Redis
- **THEN** the server silently ignores the event (idempotent); no error is emitted

### Requirement: WebRTC Signaling Relay
The system SHALL relay WebRTC signaling messages (offer, answer, ICE candidates) between call participants without interpreting their content.

#### Scenario: Relay SDP offer
- **WHEN** the initiator emits `webrtc_offer` with `{ sessionId, sdp }` over WebSocket
- **THEN** the server forwards the SDP offer to the target user verbatim

#### Scenario: Relay SDP answer
- **WHEN** the target emits `webrtc_answer` with `{ sessionId, sdp }` over WebSocket
- **THEN** the server forwards the SDP answer to the initiator verbatim

#### Scenario: Relay ICE candidate
- **WHEN** either party emits `webrtc_ice_candidate` with `{ sessionId, candidate }` over WebSocket
- **THEN** the server forwards the ICE candidate to the other party verbatim
