## Context

P0 (fix-miss-call-reliability) is archived: deadlineAt + cron single-source + `pending_call` replay + AppState /webrtc reconnect are verified. What it deliberately deferred is the call UX/edge hardening:
- the caller hears ringback **before** the server has accepted the call, producing a ghost tone whenever the server immediately rejects (`call_busy`, `User unreachable`, validation errors);
- ICE URLs are built from a single `COTURN_IP`: a dev box behind NAT inevitably leaks `turn:localhost` / `turn:10.0.2.2` to a peer that can't reach it (the `project_coturn_lan_health_fix` note was written for this, never shipped as a contract);
- `handleCallOffer/Answer/IceCandidate` drop silently on `validateParticipant` failure.

Constraints: backend `main.ts`/`WebRTCService.ts`/`CallScreen` are high-risk areas; spec-level contracts already exist for `webrtc-offline-call-push` and `webrtc-call-timeout-reliability` and should be amended by deltas, not rewritten.

## Goals / Non-Goals

**Goals:**
- No ghost ringback: caller audio is started only after an affirmative server signal and stopped on every early-reject signal.
- No unreachable TURN in ICE URLs when the operator has configured a public host; health probe path is untouched.
- No silent signaling drops: stale-expired offer/answer/ICE produce an explicit error to the sender so mobile can leave connecting.

**Non-Goals:**
- Coturn secret rotation, TURN allocation retry in TurnService, or media-layer changes.
- Changing the cron cadence or deadline semantics introduced by P0.
- Mobile permission/ringtone remapping (Android _BUNDLE_/_DEFAULT_ swapping) — out of scope.
- Re-exporting the old `callTimeouts` Map or reintroducing per-call timers.

## Decisions

- **D1 — Gate ringback behind `call_initiated`.** Rename `startRingback` invocations: remove the direct call from `WebRTCService.initiateCall`; emit behaviour stays identical (still `emit('call_initiate', …)` first). Ringback is started in the `call_initiated` handler path (either the socket listener `socket.on('call_initiated')` that forwards into `useWebRTC`/store, or a narrow `WebRTCService` handler). This makes the tone an *effect of a positive server response*, not a local side-effect of sending.
  *Alternatives:* guard `initiateCall` with an await on the server — rejected (WebSocket emits are not request-response; ack semantics would leak transport coupling).

- **D2 — Stop tone on every early-reject.** `call_busy` (already forwarded), `call_missed` (existing — covers User unreachable + cron miss), and `error` (410) all call `callAudioService.stopRingback()` (idempotent) and force the FSM out of initiating if still there. Kept in `WebRTCService` so the decision is transport-local, not hook-local; `useWebRTC` still mirrors state from events.
  *Alternative:* handle stop in hooks/screens — rejected; audio belongs to the service layer, not the navigation layer.

- **D3 — `COTURN_PUBLIC_HOST` split.** `TurnService` reads a new optional `COTURN_PUBLIC_HOST`; `this.coturnPublicHost = COTURN_PUBLIC_HOST || COTURN_IP || 'localhost'` is the only value interpolated into `stun:`/`turn:` URLs. `COTURN_IP`/`COTURN_INTERNAL_HOST` stay as probe/internal defaults. If none are set the old `localhost` URL remains, but the branch is now test-visible (spec requires: when `COTURN_PUBLIC_HOST` is set, URL host MUST equal it). This matches the `MINIO_PUBLIC_HOST` vs `MINIO_ENDPOINT` precedent.

- **D4 — Emit error on stale-expiry relays.** In `webrtc.gateway.ts` `handleCallOffer/Answer/IceCandidate`, replace `if (!valid) return;` with `if (!valid) { client.emit('error', {code: 410, message: 'Session has ended or you are no longer a participant'}); return; }`. DRY: keep `validateParticipant` returning boolean; attach reason only at the emit site so acceptance-path error payloads stay precise. Non-breaking: `error` is already a subscribed channel in `WebRTCService` (setup maps to `emit('error', …)`).

## Risks / Trade-offs

- **Ringback start now async** → adds one RT delay (ms) before tone — imperceptible; benefit is no false tone on reject. → Mitigation: stop path is synchronous on `call_busy`/`call_missed` so failed calls go quiet immediately.
- **Public host misconfigured** → hard fail still requires operator to set `COTURN_PUBLIC_HOST` in prod; with no var, localhost URLs still happen — trade-off is documented as spec requirement, not a runtime guard (would break local dev).
- **Spurious error 410** → a benign ICE that races a just-ended session now produces an error previously swallowed; mobile treats it as non-fatal (no throw — just `cleanup()`/toast path already exists).

## Migration Plan

1. Mobile reload — no breaking contract (ringback just moves one event later).
2. Backend env — add `COTURN_PUBLIC_HOST` where infra-local/.env or prod secrets live; old `COTURN_IP`-only keeps working.
3. No data migration.
4. Rollback: revert the three files; no persistent state change.

## Open Questions

- None — follow-ups belong to docs/call-flow-analysis.md refresh and CallScreen dead-code removal (tracked outside this change).
