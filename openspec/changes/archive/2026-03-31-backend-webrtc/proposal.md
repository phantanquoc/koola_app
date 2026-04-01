# backend-webrtc — Proposal

## Summary
Implement WebRTC signaling backend and Coturn health check for audio/video calls. WebSocket-based relay of SDP offers/answers and ICE candidates between callers. Coturn self-hosted STUN/TURN server integration with dynamic credential generation.

## Motivation
Phase 2 of the chat app MVP adds real-time audio/video calling. The backend must:
1. Relay WebRTC signaling (SDP + ICE) between callers via WebSocket
2. Manage call session lifecycle (initiate → active → end)
3. Integrate Coturn STUN/TURN for NAT traversal
4. Expose a health check that verifies infrastructure readiness

## Scope

### In scope
- WebRTC signaling module (`src/webrtc/`) with WebSocket gateway on `/webrtc` namespace
- Call session management via Redis (ephemeral, TTL-based)
- TURN credential generation using HMAC-SHA1 long-term auth
- Coturn health check endpoint via TCP socket probe
- 1-on-1 calls and group calls (up to 8 participants)

### Out of scope
- Actual media streaming through Coturn (handled by client-side WebRTC)
- Call recording
- E2E encryption for signaling
- React Native client (rn-call module)

## Deliverables
- `src/webrtc/` — NestJS module with WebSocket gateway + services
- `src/health/` — Health check controller with Coturn probe
- OpenSpec change artifacts: `proposal.md`, `design.md`, `tasks.md`
