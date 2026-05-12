## ADDED Requirements

### Requirement: Call log creation on initiate
The backend SHALL create a `call-logs` row for every `call_initiate` request that results in a session being created. The row SHALL NOT be created when the call is rejected for busy, rate limiting, self-call, missing conversation membership, or duplicate session. The initial `status` SHALL be `missed`, `startedAt` SHALL be the current time, `answeredAt` and `endedAt` SHALL be null, and `duration` SHALL be 0.

#### Scenario: Online call produces a log row immediately
- **GIVEN** caller A and callee B are both online
- **WHEN** A emits `call_initiate` targeting B
- **THEN** the backend creates a `call-logs` row with `sessionId` matching the new session, `initiatorId=A`, `targetUserId=B`, `conversationId`, `callType`, `status='missed'`, `startedAt=now`, `answeredAt=null`, `endedAt=null`, `duration=0`
- **AND** the row is created before the `call_initiated` event is emitted to the caller

#### Scenario: Offline-push call produces a log row immediately
- **GIVEN** caller A is online, callee B is offline with at least one FCM token
- **WHEN** A emits `call_initiate` targeting B
- **THEN** the backend creates a `call-logs` row with `status='missed'` before sending the FCM push
- **AND** the row is created regardless of FCM delivery outcome

#### Scenario: No log row is created when target is busy
- **GIVEN** callee B already has an active call session
- **WHEN** caller A emits `call_initiate` targeting B
- **THEN** the backend emits `call_busy` to A
- **AND** no `call-logs` row is created
- **AND** no session is created

### Requirement: Call log updated on accept
The backend SHALL update the `call-logs` row to `status='answered'` and set `answeredAt` to the current time when the callee accepts the call.

#### Scenario: Callee accepts an initiated call
- **GIVEN** a `call-logs` row exists with `status='missed'`, `answeredAt=null`
- **WHEN** the callee emits `call_accept` for the session
- **THEN** the backend updates the log to `status='answered'`, `answeredAt=now`
- **AND** `endedAt` remains null and `duration` remains 0 until the call ends

### Requirement: Call log updated on decline
The backend SHALL update the `call-logs` row to `status='declined'`, set `endedAt` to the current time, and set `duration` to 0 when the callee declines the call.

#### Scenario: Callee declines an initiated call
- **GIVEN** a `call-logs` row exists with `status='missed'`
- **WHEN** the callee emits `call_decline` for the session
- **THEN** the backend updates the log to `status='declined'`, `endedAt=now`, `duration=0`

### Requirement: Call log updated on cancel
The backend SHALL update the `call-logs` row to `status='cancelled'`, set `endedAt` to the current time, and set `duration` to 0 when the initiator cancels the call before the callee answers.

#### Scenario: Caller cancels an initiated call
- **GIVEN** a `call-logs` row exists with `status='missed'` and the session state is `initiated`
- **WHEN** the initiator emits `call_cancel` for the session
- **THEN** the backend updates the log to `status='cancelled'`, `endedAt=now`, `duration=0`

### Requirement: Call log updated on end with computed duration
The backend SHALL update the `call-logs` row to `status='ended'`, set `endedAt` to the current time, and set `duration` to `Math.floor((endedAt - answeredAt) / 1000)` seconds when a participant ends the call. If the call was never answered (`answeredAt` is null), `duration` SHALL be 0.

#### Scenario: Answered call ends after 90 seconds
- **GIVEN** a `call-logs` row has `status='answered'`, `answeredAt=T0`
- **WHEN** any participant emits `call_end` at time `T0 + 90 seconds`
- **THEN** the backend updates the log to `status='ended'`, `endedAt=now`, `duration=90`

#### Scenario: Unanswered call ends (edge case)
- **GIVEN** a `call-logs` row has `status='missed'`, `answeredAt=null`
- **WHEN** a participant emits `call_end` before accept
- **THEN** the backend updates the log to `status='ended'`, `endedAt=now`, `duration=0`

### Requirement: Call log updated on online timeout
The backend SHALL update the `call-logs` row to `status='missed'`, set `endedAt` to the current time, and set `duration` to 0 when the 30-second online call timeout expires with no accept.

#### Scenario: Callee does not accept within 30 seconds
- **GIVEN** a `call-logs` row has `status='missed'` from initiate
- **WHEN** 30 seconds elapse with no `call_accept`, `call_decline`, or `call_cancel`
- **THEN** the backend keeps `status='missed'`, sets `endedAt=now`, `duration=0`
- **AND** emits `call_missed` to the initiator and `call_timeout` to the target

### Requirement: Call log updated on offline-push grace expiry
The backend SHALL update the `call-logs` row to `status='missed'`, set `endedAt` to the current time, and set `duration` to 0 when the 25-second offline-push grace timer expires with no accept.

#### Scenario: Offline callee never comes online within grace window
- **GIVEN** a `call-logs` row has `status='missed'` from offline-push initiate
- **WHEN** 25 seconds elapse with no terminal event
- **THEN** the backend keeps `status='missed'`, sets `endedAt=now`, `duration=0`
- **AND** emits `call_missed` to the initiator with reason `No answer`

### Requirement: Cron cleanup updates stale session logs
The `CallSessionCronService` SHALL update `call-logs` rows to `status='missed'` for sessions it cleans up as stale, so that gateway-crash-mid-call scenarios still produce accurate history.

#### Scenario: Gateway crashes between session create and terminal emit
- **GIVEN** a session is stuck in `initiated` state in Redis because the gateway process restarted
- **WHEN** the cron service detects the stale session via `cleanupStaleSessions`
- **THEN** the backend updates the matching `call-logs` row to `status='missed'`, `endedAt=now`, `duration=0`
- **AND** removes the session from Redis

### Requirement: Call log writes never throw
Every `callLogsService.createLog` and `callLogsService.updateLog` call from the gateway SHALL be wrapped in try/catch. On failure, the error SHALL be logged via `logger.error` with the `sessionId` and error message, and the call flow SHALL continue normally.

#### Scenario: MongoDB is temporarily unavailable during call initiate
- **GIVEN** the MongoDB connection is failing
- **WHEN** `handleCallInitiate` attempts `callLogsService.createLog`
- **THEN** the error is logged but not thrown
- **AND** the session is still created in Redis
- **AND** the `call_initiated` event is still emitted to the caller
- **AND** the callee still receives `incoming_call` or the FCM push

#### Scenario: Update fails on accept
- **GIVEN** MongoDB rejects the `updateLog` call for `status='answered'`
- **WHEN** `handleCallAccept` runs
- **THEN** the error is logged but not thrown
- **AND** the session state still transitions to `active`
- **AND** the `call_accepted` event is still emitted to the initiator

### Requirement: Call history endpoint reflects updated logs
The `GET /call-logs` REST endpoint SHALL return rows reflecting the updated `status`, `answeredAt`, `endedAt`, and `duration` fields for the authenticated user, sorted by `startedAt` descending.

#### Scenario: User requests call history after a completed call
- **GIVEN** user U completed a 45-second call with status `ended` at time T
- **WHEN** U calls `GET /call-logs?page=1&limit=20`
- **THEN** the response includes the row with `status='ended'`, `duration=45`, `answeredAt` and `endedAt` populated
- **AND** the row appears at or near the top of the sorted results
