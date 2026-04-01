# backend-webrtc — Design

## Architecture

### Module Structure

```
src/webrtc/
  webrtc.module.ts              ← root module
  webrtc.gateway.ts             ← WebSocket gateway (/webrtc namespace)
  services/
    call-session.service.ts     ← Redis: create/read/update session
    turn.service.ts              ← TURN credential generation
  dto/
    call-initiate.dto.ts
    call-offer.dto.ts
    call-answer.dto.ts
    call-ice-candidate.dto.ts
    call-accept.dto.ts
    call-decline.dto.ts
    call-end.dto.ts
    call-join.dto.ts

src/health/
  health.module.ts
  health.controller.ts
  services/
    coturn-health.service.ts
```

### WebSocket Namespace: `/webrtc`

Separate from `/chat` for clean separation of concerns. All call signaling events live here.

### Redis Key Design

| Key | Type | TTL | Purpose |
|-----|------|-----|---------|
| `call:<sessionId>` | Hash | 3600s | Session state + metadata |
| `call_timeout:<sessionId>` | String | 60s | Timeout guard — expire = missed |
| `call_participants:<sessionId>` | Set | 3600s | Participant userIds |

### Call Session Schema (Redis Hash `call:<sessionId>`)

```json
{
  "sessionId": "uuid-v4",
  "initiatorId": "userId",
  "targetUserId": "userId | null",
  "conversationId": "convId",
  "callType": "audio | video",
  "state": "initiated | active | ended | missed | declined",
  "createdAt": "ISO-8601",
  "participantCount": 1
}
```

### Call State Machine

```
initiated
  ├─→ active     (call_accept or ≥2 participants joined)
  ├─→ declined    (call_decline)
  ├─→ missed      (60s timeout, TTL expires)
  └─→ ended       (call_end)
active
  └─→ ended       (call_end)
declined / missed / ended = terminal
```

### TURN Credential Generation

Format: Coturn long-term credentials
```
username = <unix-timestamp>:<targetUserId>
password = HMAC-SHA1(static-auth-secret, username)
TTL = 3600 seconds
```

Returned ICE servers config:
```json
[
  { "urls": "stun:<COTURN_HOST>:3478" },
  { "urls": "turn:<COTURN_HOST>:3478", "username": "...", "credential": "..." }
]
```

### WebSocket Events

#### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `call_initiate` | `{ targetUserId, conversationId, callType }` | Start a call |
| `call_join` | `{ sessionId }` | Join a group call |
| `call_offer` | `{ sessionId, sdp }` | SDP offer |
| `call_answer` | `{ sessionId, sdp }` | SDP answer |
| `call_ice_candidate` | `{ sessionId, candidate }` | ICE candidate |
| `call_accept` | `{ sessionId }` | Accept incoming call |
| `call_decline` | `{ sessionId }` | Decline incoming call |
| `call_end` | `{ sessionId }` | End call |

#### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `call_initiated` | `{ sessionId, iceServers, targetUserId, callType }` | ACK to caller |
| `incoming_call` | `{ sessionId, fromUserId, fromUser, callType, conversationId, iceServers }` | Ringing target |
| `call_joined` | `{ sessionId, participants }` | ACK to joining participant |
| `call_offer` | `{ sessionId, fromUserId, sdp }` | Relayed to callee |
| `call_answer` | `{ sessionId, fromUserId, sdp }` | Relayed to caller |
| `call_ice_candidate` | `{ sessionId, fromUserId, candidate }` | Relayed to peer |
| `call_accepted` | `{ sessionId }` | To caller on accept |
| `call_declined` | `{ sessionId, reason }` | To caller on decline |
| `call_ended` | `{ sessionId }` | To all participants |
| `call_missed` | `{ sessionId, reason }` | Timeout or offline |
| `error` | `{ code, message }` | Error response |

### Health Check Endpoint

`GET /health` → `200 OK` or `503 Service Unavailable`

```json
{
  "status": "ok | degraded | error",
  "timestamp": "ISO-8601",
  "checks": {
    "mongodb": "up | down",
    "redis": "up | down",
    "coturn": "up | down"
  }
}
```

- `ok`: all checks pass
- `degraded`: Coturn down (calls can't TURN but can still P2P)
- `error`: MongoDB or Redis down (core functionality broken)

### Integration Points

```
WebrtcModule
  ├─→ RedisModule (ioredis) — session storage
  ├─→ ConversationsService — validate membership
  ├─→ UsersService — get caller/callee displayName
  └─→ TurnService — generate ICE server config

HealthModule
  └─→ CoturnHealthService — TCP socket probe on port 3478
```

### Environment Variables

```
COTURN_HOST=<coturn-public-ip-or-domain>
COTURN_SECRET=<static-auth-secret>
COTURN_PORT=3478
```

## Security Considerations

- All WebSocket events require valid JWT (via `WsAuthGuard`)
- Only conversation members can initiate calls
- Call session tokens are tied to sessionId (UUID v4, unguessable)
- TURN credentials have 1h TTL, target-specific username prevents relay sharing
- Rate limiting: 10 call_initiate/min per user (handled by NestJS Throttler)
