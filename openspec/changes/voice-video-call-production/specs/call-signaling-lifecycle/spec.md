## ADDED Requirements

### Requirement: Server-side call timeout
The gateway SHALL start a 30-second timer when a call session is created. If the session is still in state 'initiated' after 30 seconds, the server SHALL mark the session as 'missed', emit 'call_missed' to the initiator socket, and emit 'call_timeout' to the target socket. The timer handle SHALL be stored in a Map keyed by sessionId and SHALL be cleared on any terminal event (accept, decline, end, cancel).

#### Scenario: Call not answered within 30 seconds
- **WHEN** a call session is created and 30 seconds elapse with no accept or decline
- **THEN** the server marks the session status as 'missed', emits 'call_missed' to the caller, and emits 'call_timeout' to the callee

#### Scenario: Call answered before timeout fires
- **WHEN** the callee emits 'call_accept' before the 30-second timer elapses
- **THEN** the timeout handle is cleared and no timeout events are emitted

#### Scenario: Call declined before timeout fires
- **WHEN** the callee emits 'call_decline' before the 30-second timer elapses
- **THEN** the timeout handle is cleared and no timeout events are emitted

### Requirement: Caller cancel before answer
The gateway SHALL handle a 'call_cancel' event from the caller. The caller MUST be the session initiator and the session MUST be in state 'initiated'. On valid cancel, the gateway SHALL mark the session as 'ended', emit 'call_cancelled' to the callee socket, and clear the call timeout handle.

#### Scenario: Caller cancels an unanswered call
- **WHEN** the caller emits 'call_cancel' with a valid sessionId while the session is 'initiated'
- **THEN** the session is marked 'ended', 'call_cancelled' is emitted to the callee, and the timeout handle is cleared

#### Scenario: Cancel attempted by non-initiator
- **WHEN** a socket that is not the session initiator emits 'call_cancel'
- **THEN** the request is rejected with an error acknowledgement and no state change occurs

#### Scenario: Cancel attempted on already-answered session
- **WHEN** the caller emits 'call_cancel' but the session is already in state 'accepted'
- **THEN** the request is rejected with an error acknowledgement

### Requirement: Callee busy detection
The gateway SHALL check whether the target user has any active call sessions before delivering an incoming call. If the target user has an active session, the gateway SHALL emit 'call_busy' to the caller and SHALL NOT forward 'incoming_call' to the callee.

#### Scenario: Callee is already in a call
- **WHEN** a caller initiates a call to a user who has an active session
- **THEN** the gateway emits 'call_busy' to the caller and the new session is not created

#### Scenario: Callee is not in any active call
- **WHEN** a caller initiates a call to a user with no active sessions
- **THEN** the gateway creates the session and emits 'incoming_call' to the callee as normal

### Requirement: Ringing acknowledgement
The gateway SHALL handle a 'call_ringing' event from the callee. When received, the gateway SHALL relay a 'call_ringing' event to the initiator's socket to confirm the callee's device is alerting.

#### Scenario: Callee device shows incoming call UI
- **WHEN** the callee emits 'call_ringing' with a valid sessionId
- **THEN** the gateway emits 'call_ringing' to the initiator socket

#### Scenario: Ringing emitted for unknown session
- **WHEN** 'call_ringing' is received for a sessionId that does not exist
- **THEN** the request is ignored silently

### Requirement: Multi-device cancel on accept
When a callee accepts a call on one device, the gateway SHALL emit 'call_cancelled' to all other connected sockets belonging to the same user, excluding the accepting socket.

#### Scenario: User accepts on one device while logged in on two
- **WHEN** the callee emits 'call_accept' from socket A
- **THEN** 'call_cancelled' is emitted to all other sockets in the 'user:<userId>' room except socket A

#### Scenario: User has only one connected device
- **WHEN** the callee emits 'call_accept' and has only one socket in the user room
- **THEN** no 'call_cancelled' is emitted to other devices

### Requirement: Double-call detection (bidirectional)
The gateway SHALL check for existing sessions in both directions (A→B and B→A) before creating a new call session. If a session exists in either direction between the two users in the same conversation, 'call_busy' SHALL be emitted to the initiator.

#### Scenario: Session already exists from caller to callee
- **WHEN** user A calls user B and a session from A to B already exists
- **THEN** 'call_busy' is emitted to A and no new session is created

#### Scenario: Session already exists from callee to caller
- **WHEN** user A calls user B and a session from B to A already exists
- **THEN** 'call_busy' is emitted to A and no new session is created

### Requirement: Client call state machine
The webrtcService SHALL enforce a strict set of valid state transitions. Any transition not in the allowed set SHALL be logged and silently ignored.

Valid transitions:
- idle → initiating (on initiateCall)
- initiating → ringing (on call_ringing received)
- ringing → connecting (on call_accepted)
- connecting → active (on ICE connected)
- active → ended (on hangup / call_end)
- initiating → ended (on call_cancelled / call_busy / hangup)
- ringing → ended (on call_cancelled / call_busy / hangup)
- connecting → failed (on ICE failed after max retries)
- failed → ended (on explicit end or server timeout)
- any → ended (on call_declined / call_timeout)

#### Scenario: Valid state transition
- **WHEN** webrtcService receives an event that maps to an allowed transition from the current state
- **THEN** the state is updated and the new state is published to the hook

#### Scenario: Invalid state transition attempted
- **WHEN** webrtcService receives an event that is not allowed from the current state
- **THEN** the state remains unchanged and a warning is logged

### Requirement: Callee info included in call_initiated event
The gateway SHALL include the target user's displayName and avatar URL in the 'call_initiated' event payload emitted to the caller, and in the 'incoming_call' payload emitted to the callee.

#### Scenario: Caller receives callee display info
- **WHEN** a call is initiated
- **THEN** the 'call_initiated' payload contains { sessionId, callType, conversationId, remoteUser: { id, displayName, avatar } }

#### Scenario: Callee receives caller display info
- **WHEN** an incoming call is delivered
- **THEN** the 'incoming_call' payload contains { sessionId, callType, conversationId, remoteUser: { id, displayName, avatar } }
