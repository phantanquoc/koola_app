## Why

P0 (fix-miss-call-reliability, archived 2026-08-20) made missed-call detection reliable (deadlineAt + cron single source, pending_call replay, AppState webrtc reconnect) but its scope commit left three P1 hardening items untouched: (1) ringback is started in `WebRTCService.initiateCall` before the server has confirmed anything, so `call_busy` / `call_missed` / validation-error victims still hear a 1-2s ghost ringback; (2) `TurnService` advertises a single `COTURN_IP` in ICE URLs, so a `/health` probe and client TURN can be polluted by `turn:localhost` or `extern-ip=10.*` in infra-local; and (3) `/webrtc` offer/answer/ICE relays silently drop on `validateParticipant` failure, leaving both parties hanging in connecting with no state transition.

## What Changes

- **BREAKING (internal, behavioural): ringback lifecycle owned by server confirmation, not local emit** — `WebRTCService.initiateCall` no longer calls `startRingback()` directly; ringback is started only on `call_initiated` from the gateway, and is stopped promptly on `call_busy`, `call_missed` (any reason), and `error` events so a rejected/reach-unreachable call produces no transient tone. Terminal paths (`call_missed`/`call_ended`/`call_failed`/`call_timeout`) already stop via `cleanup()`; the change is the *start* gate plus the *prompt* stop on the early-reject branches.
- **Coturn host split** — `TurnService` reads a peer-facing `COTURN_PUBLIC_HOST` (fallback `COTURN_IP` → `localhost` for compat) for every `stun:…`/`turn:…` URL it hands to the client. `COTURN_IP` (and existing `COTURN_INTERNAL_HOST`) stay internal/probe-facing. The split is done per `project_coturn_lan_health_fix` and validated by the existing `CoturnHealthService` split; no secret change.
- **Signaling error surfacing** — `WebrtcGateway.handleCallOffer` / `handleCallAnswer` / `handleIceCandidate` replace `if (!valid) return;` with an explicit error emit to the sender (`code: 410, message: 'Session has ended or you are no longer a participant'`) so the mobile can `cleanup()` / transition instead of hanging in `connecting`.

## Capabilities

### New Capabilities
- `turn-ice-server-config`: peer-facing vs internal coturn host resolution for ICE server lists (COTURN_PUBLIC_HOST split, loopback guard).

### Modified Capabilities
- `webrtc-offline-call-push`: ringback/ringtone contract clarifies caller-side lifecycle (start only after `call_initiated`, stop on early rejects).
- `webrtc-call-timeout-reliability`: error surfacing on stale/expired participants clarifies timeout/failure transition.

## Impact

- Mobile: `ChatApp/src/services/webrtc/WebRTCService.ts` (ringback start/stop), `ChatApp/src/hooks/useWebRTC.ts` (no behavioural change — already maps events to state), `ChatApp/src/screens` call screens (already stop via service cleanup).
- Backend: `chat-backend/src/webrtc/services/turn.service.ts` (host resolution + URL building), `chat-backend/src/webrtc/webrtc.gateway.ts` (offer/answer/ICE `validateParticipant` branches).
- Specs/tests: deltas touching `openspec/specs/webrtc-offline-call-push`, `webrtc-call-timeout-reliability`, `coturn` or a new turn spec; verify suite webrtc.* + WebRTCService call specs.
- Data/infra: new env `COTURN_PUBLIC_HOST` (optional; default fallbacks keep old behaviour); if nothing is set old `localhost` default remains but is now **observable** (dead-host smoke test) and override is documented in `openspec/ui-dna` / `.env.example`.
