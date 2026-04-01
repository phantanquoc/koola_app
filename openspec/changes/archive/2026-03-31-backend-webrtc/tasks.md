# backend-webrtc — Tasks

## Setup

- [x] 1.1 Create `src/webrtc/` directory structure
- [x] 1.2 Create `src/health/` directory structure
- [x] 1.3 Add `COTURN_IP`, `TURN_STATIC_SECRET`, `COTURN_PORT` to `.env`

## TURN Service

- [x] 2.1 Implement `TurnService.generateCredentials(targetUserId: string): { username, password }`
  - HMAC-SHA1 of `static-auth-secret` over `username`
  - username = `<unix-timestamp>:<targetUserId>`
  - TTL = 3600
- [x] 2.2 Implement `TurnService.getIceServers(targetUserId: string): RTCIceServer[]`
  - Returns array with STUN + TURN entries
  - Calls `generateCredentials()` for TURN entry

## Call Session Service

- [x] 3.1 Implement `CallSessionService.createSession(params): Promise<CallSession>`
  - Generate UUID v4 sessionId
  - Store in Redis hash `call:<sessionId>`, TTL 3600s
  - Return session object
- [x] 3.2 Implement `CallSessionService.getSession(sessionId): Promise<CallSession | null>`
  - Read from Redis hash
- [x] 3.3 Implement `CallSessionService.updateSessionState(sessionId, state)`
  - Update `state` field in Redis hash
  - On terminal state: delete `call_timeout:<sessionId>` key
- [x] 3.4 Implement `CallSessionService.addParticipant(sessionId, userId): boolean`
  - Add to Redis Set `call_participants:<sessionId>`, TTL 3600s
  - Increment `participantCount` in hash
  - Enforce max 8 participants
- [x] 3.5 Implement `CallSessionService.getParticipants(sessionId): string[]`
  - Read from Redis Set
- [x] 3.6 Implement `CallSessionService.endSession(sessionId)`
  - Set state = `ended`, delete timeout key, clean up participants key

## WebRTC Gateway

- [x] 4.1 `@WebSocketGateway({ namespace: '/webrtc', cors: true })`
  - Inject `CallSessionService`, `TurnService`, `ConversationsService`, `UsersService`
- [x] 4.2 `call_initiate` handler
  - Validate caller is conversation member
  - Check if active session already exists for this target (reject if yes)
  - Create Redis session with state `initiated`
  - Set `call_timeout:<sessionId>` key with 60s TTL (via Redis SETEX)
  - Generate ICE servers via `TurnService`
  - If target is offline (no socket in `user:<targetUserId>`) → emit `call_missed` immediately, mark `missed`
  - If target online → emit `incoming_call` to `user:<targetUserId>`
  - Emit `call_initiated` to caller
- [x] 4.3 `call_join` handler (group calls)
  - Validate session exists and is `initiated` or `active`
  - Check participant count < 8
  - Add participant to session
  - Emit `call_joined` to joining user with current participants list
  - If participant count ≥ 2, update state to `active` and cancel timeout
- [x] 4.4 `call_offer` handler
  - Validate user is participant
  - Relay to target's personal room
- [x] 4.5 `call_answer` handler
  - Validate user is participant
  - Relay to initiator's personal room
  - Update state to `active` if still `initiated`
- [x] 4.6 `call_ice_candidate` handler
  - Validate user is participant
  - Relay to other participants' rooms
- [x] 4.7 `call_accept` handler
  - Validate user is target of session
  - Update state to `active`
  - Delete `call_timeout:<sessionId>` key
  - Emit `call_accepted` to initiator
- [x] 4.8 `call_decline` handler
  - Validate user is target of session
  - Update state to `declined`
  - Delete `call_timeout:<sessionId>` key
  - Emit `call_declined` to initiator
- [x] 4.9 `call_end` handler
  - Validate user is participant
  - Call `endSession()`
  - Emit `call_ended` to all participants

## Health Module

- [x] 5.1 `CoturnHealthService`
  - `isReachable(): Promise<boolean>`
  - TCP socket connect to `COTURN_IP:COTURN_PORT`, 3s timeout
  - Destroy socket on result
- [x] 5.2 `HealthController`
  - `GET /health` — aggregated health status
  - Check MongoDB (mongoose connection check)
  - Check Redis (PING)
  - Check Coturn (`CoturnHealthService.isReachable()`)
  - Return appropriate status + details

## Module Registration

- [x] 6.1 Create `src/webrtc/webrtc.module.ts`
  - Import `ConversationsModule`, `UsersModule`
  - Register all services + gateway
- [x] 6.2 Create `src/health/health.module.ts`
  - Register `HealthController`, `CoturnHealthService`
- [x] 6.3 Add `WebrtcModule` to `src/app.module.ts` imports
- [x] 6.4 Add `HealthModule` to `src/app.module.ts` imports

## DTOs

- [x] 7.1 `call-initiate.dto.ts` — targetUserId (string, required), conversationId (string, required), callType (enum: audio|video, required)
- [x] 7.2 `call-offer.dto.ts` — sessionId (string, required), sdp (string, required)
- [x] 7.3 `call-answer.dto.ts` — sessionId (string, required), sdp (string, required)
- [x] 7.4 `call-ice-candidate.dto.ts` — sessionId (string, required), candidate (string, required)
- [x] 7.5 `call-accept.dto.ts` — sessionId (string, required)
- [x] 7.6 `call-decline.dto.ts` — sessionId (string, required)
- [x] 7.7 `call-end.dto.ts` — sessionId (string, required)
- [x] 7.8 `call-join.dto.ts` — sessionId (string, required)

## Verification

- [x] 8.1 Run `npx tsc --noEmit` — zero type errors ✅
- [x] 8.2 All task checkboxes above marked `[x]`
- [x] 8.3 Health endpoint returns correct status for all infrastructure states
