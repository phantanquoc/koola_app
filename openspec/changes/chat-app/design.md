## Context

Building a full-featured real-time chat mobile application from scratch. The system consists of three layers: React Native mobile client, NestJS backend, and infrastructure on Proxmox (MongoDB, MinIO, Redis, Coturn).

**Current state**: Greenfield project. No existing code.

**Constraints**:
- Self-hosted infrastructure on Proxmox with abundant storage
- Phase 1 MVP must be shippable with text, media, push notifications
- E2E encryption deferred to Phase 3 (TLS-only in Phase 1)
- Team is 1 developer working alone
- No external cloud PaaS dependencies except Firebase for FCM

**Stakeholders**: End users (consumer messaging app), developer (self)

## Goals / Non-Goals

**Goals:**
- Complete, shippable MVP with core messaging (1-on-1 + group)
- Reliable real-time delivery via hybrid REST + WebSocket architecture
- Offline-first experience: messages sent/received even when connectivity drops
- Scalable storage architecture using MinIO on existing Proxmox hardware
- WebRTC-ready infrastructure for Phase 2 audio/video calls

**Non-Goals:**
- E2E encryption in Phase 1 (TLS-only — server can read message content)
- Voice/video calls in Phase 1 (Phase 2)
- Message reactions, reply threads (Phase 3)
- File type transcoding or media preview generation on server
- Admin dashboard or moderation tools
- Multi-language / i18n

## Decisions

### D1: Hybrid REST + WebSocket for Real-Time Communication

**Decision**: Message sending via REST POST, real-time events (typing, presence, new message broadcast, read receipts) via WebSocket.

**Rationale**: REST provides reliable delivery semantics with standard HTTP retry mechanisms. WebSocket carries only ephemeral events. This separation allows the message send flow to be tested and debugged as a standard API call, while keeping WebSocket traffic minimal. Alternatives considered:

- Pure WebSocket for everything: increases complexity of delivery guarantee — no standard retry, no HTTP interceptor ecosystem
- Pure REST polling: adds server load, introduces latency, poor UX

**Implementation**: NestJS REST controllers for message CRUD. `@WebSocketGateway` from `@nestjs/websockets` with Socket.io adapter for events.

### D2: MongoDB Single Instance (MVP)

**Decision**: MongoDB runs as a single instance on Proxmox VM (no replica set).

**Rationale**: MVP with no SLA requirement. Single instance is simpler to operate. If data loss is unacceptable, a 3-node replica set can be added later. Alternative (recommended for future): replica set with 1 primary + 2 secondaries on 3 Proxmox VMs.

### D3: MinIO for Media Storage (S3-Compatible)

**Decision**: Media files stored in MinIO running as Docker container on Proxmox VM3, not in MongoDB (GridFS) or cloud S3.

**Rationale**: Leverages existing Proxmox storage. MinIO exposes S3-compatible API, so client upload uses standard presigned URL flow. Storing media in MongoDB (GridFS) is not recommended for files >16MB and adds load to the DB. Cloud S3 incurs ongoing costs.

**Upload flow**:
1. Client calls `POST /media/upload` requesting a presigned URL
2. NestJS calls MinIO `presignedPutObject()` with expiry (15 min)
3. Client uploads directly to MinIO via presigned URL
4. On upload success, client calls `POST /messages` with `mediaUrl` reference

### D4: Coturn Self-Hosted on Proxmox

**Decision**: Coturn STUN/TURN server installed on VM3 alongside MinIO.

**Rationale**: Eliminates dependency on third-party TURN services (Xirsys, Twilio). Coturn runs as a lightweight Docker container. TURN is only used as fallback (~30% of calls behind strict NAT), so resource requirements are minimal. STUN handles the majority of calls at zero bandwidth cost.

**Configuration**: Coturn public IP bound to Proxmox VM3 external interface. ICE servers in React Native: `[{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'turn:<public-ip>:3478', username: 'turn', credential: '<secret>' }]`

### D5: Redis for Socket Adapter (Future Scaling)

**Decision**: Redis installed on VM4, used as Socket.io adapter from day 1.

**Rationale**: Adding Redis adapter later requires a code change. Starting with Redis from MVP means horizontal scaling is a config change, not a code change. Redis also serves as cache layer (e.g., online presence cache) and message queue for notification workers.

### D6: FCM for Push Notifications

**Decision**: Firebase Cloud Messaging handles push notifications. NestJS uses `firebase-admin` SDK.

**Rationale**: Standard industry approach for Android. For iOS, APNs is configured in the same Firebase project via APNs auth key, so the same FCM API call reaches both platforms. Alternative (self-hosted) would require building a custom push service — not worth the effort for MVP.

### D7: JWT with Refresh Token Rotation

**Decision**: Access token: 1 hour, stored in memory (not AsyncStorage). Refresh token: 30 days, stored in AsyncStorage, sent via `httpOnly` cookie or `Authorization` header.

**Rationale**: Short-lived access tokens limit the damage of token theft. Refresh token rotation ensures old tokens are invalidated on use — if a refresh token is stolen and used, the original token is revoked. Tokens stored server-side in MongoDB (not Redis) for simplicity — Redis can be added for faster validation at scale.

### D8: Offline Queue with Exponential Backoff

**Decision**: React Native client uses AsyncStorage/MMKV to queue messages when offline. On reconnect: (1) POST all queued messages, (2) GET `/messages?since={lastSyncAt}` for missed messages, (3) clear queue on ACK.

**Rationale**: This pattern is battle-tested (WhatsApp, Telegram). Optimistic UI updates (show "sending..." immediately) give perceived speed. Exponential backoff prevents thundering herd on reconnect. `lastSyncAt` stored in MMKV so sync state survives app restart.

## Risks / Trade-offs

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| WebSocket reconnect logic causes duplicate messages or lost messages | Medium | High | Implement exponential backoff + dedup by messageId on server |
| FCM delivery delays (can be 30s+) | Medium | Medium | In-app real-time delivery for online users — FCM only when offline |
| Coturn bandwidth costs if many calls relay through TURN | Low | Low | Monitor; Coturn relay only ~30% of calls |
| MongoDB data loss (single instance) | Low | High | Add replica set before Phase 2 or as first production hardening task |
| Firebase FCM requires maintaining APNs certs for iOS | Medium | Medium | Annual renewal reminder; Firebase handles both FCM + APNs via auth key |
| MinIO data loss (single drive) | Low | High | Add Proxmox-level backup (snapshot) before Phase 2 |
| Large file upload (100MB) fails on slow mobile network | Medium | Medium | Chunked upload support; resumable upload via MinIO multipart |
| 1 developer scope is very large | High | High | Strict phase gating — Phase 1 MVP must be shippable before Phase 2 starts |
| User uploads malicious file type | Low | Medium | Validate MIME type server-side; serve files with `Content-Disposition: attachment` |

## Migration Plan

**This is a greenfield project — no migration needed.**

Deployment sequence:
1. Provision VM2: MongoDB
2. Provision VM4: Redis
3. Provision VM3: MinIO + Coturn
4. Provision VM1: NestJS backend
5. Deploy React Native app to test devices

**Rollback**: Since greenfield, rollback = redeploy previous version via git tag. No data migration involved in MVP.

## Open Questions

| # | Question | Status | Resolution |
|---|----------|--------|------------|
| 1 | Should message edit/delete be supported in Phase 1? | Open | Recommend: delete only (Phase 1), edit (Phase 3) |
| 2 | Group chat — should members be notified when someone is added/removed? | Open | Recommend: yes, system message in chat "X added Y to group" |
| 3 | Should typing indicator debounce on client or server? | Open | Recommend: client debounce (500ms), server broadcast on event |
| 4 | Avatar upload — same MinIO flow as media files? | Open | Recommend: yes, reuse `POST /media/upload` presigned URL flow |
| 5 | Rate limiting — should there be a per-user message rate limit? | Open | Recommend: yes, 60 messages/min per user to prevent spam |
