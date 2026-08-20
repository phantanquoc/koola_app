## 1. Mobile — Caller ringback lifecycle owned by server confirmation

- [x] 1.1 In `ChatApp/src/services/webrtc/WebRTCService.ts:connect` keep safe-dispose invariant (already in P0); no change.
- [x] 1.2 In `ChatApp/src/services/webrtc/WebRTCService.ts:initiateCall` remove the direct `callAudioService.startRingback()` call — the caller no longer hears tone as a side-effect of emitting. Verify: searching `initiateCall` body contains no `startRingback`.
- [x] 1.3 In `ChatApp/src/services/webrtc/WebRTCService.ts:setupSocketListeners` gate ringback start behind `call_initiated`: on `socket.on('call_initiated')` invoke `callAudioService.startRingback()` before forwarding `emit('call_initiated', data)`. On `socket.on('call_busy')`, `socket.on('call_missed')` while still in states `initiating`/`ringing`/`connecting`, and on `socket.on('error', code 410)` while in the same states, invoke `callAudioService.stopRingback()` (idempotent) before forwarding, so a rejected/unreachable call never produces audible ringback ← (verify: unit test asserts no ringback on 410/mock miss; online path still hears ringback after `call_initiated`; global `grep startRingback` has zero hits in `initiateCall` and exactly one in `setupSocketListeners`).
- [x] 1.4 Audit `ChatApp/src/hooks/useWebRTC.ts` + `ChatApp/src/screens/call/*` for stray direct ringback triggers — none expected. Verify: `useWebRTC` does not call `startRingback` itself.

## 2. Backend — Coturn public host split

- [x] 2.1 In `chat-backend/src/webrtc/services/turn.service.ts` resolve peer-facing host as `COTURN_PUBLIC_HOST ?? COTURN_IP ?? 'localhost'` and use it for every `stun:`/`turn:` URL returned by `getIceServers()`. Keep `COTURN_INTERNAL_HOST` / `COTURN_IP` for probes unchanged (already handled by `CoturnHealthService`). Document fallback chain in the file's header comment ← (verify: `turn.service.spec.ts` covers public-host override, fallback to COTURN_IP, and localhost default; existing `coturn-health` tests stay green).
- [x] 2.2 In `chat-backend/.env.example` add `COTURN_PUBLIC_HOST` documentation with the fallback chain and the MINIO precedent note (`MINIO_PUBLIC_HOST` vs `MINIO_ENDPOINT`). No code change in `infra-local` beyond what `TurnService` reads — Compose's `COTURN_IP` keeps driving coturn flags as today ← (verify: `.env.example` mentions `COTURN_PUBLIC_HOST` once and does not contradict the existing `COTURN_IP` block).

## 3. Backend — SDP/ICE relay surfaces error on stale-expired session

- [x] 3.1 In `chat-backend/src/webrtc/webrtc.gateway.ts:handleCallOffer` replace silent `if (!valid) return;` with `if (!valid) { client.emit('error', { code: 410, message: 'Session has ended or you are no longer a participant' }); return; }`. No other behaviour change ← (verify: new regression/webrtc gateway spec for 410 on stale offer).
- [x] 3.2 In `chat-backend/src/webrtc/webrtc.gateway.ts:handleCallAnswer` — same 410 error surface on `validateParticipant` failure ← (verify: answer-after-terminate emits 410; valid answer still relays).
- [x] 3.3 In `chat-backend/src/webrtc/webrtc.gateway.ts:handleIceCandidate` — same 410 error surface on `validateParticipant` failure ← (verify: ICE-after-terminate emits 410; valid ICE still fans out).
- [x] 3.4 Verify `validateParticipant` contract unchanged (early null-check on session absence covered by same branch; do not widen its return type).

## 4. Tests + hygiene

- [x] 4.1 `npx tsc --noEmit` passes in `chat-backend/` after 1-3 (before touching mobile) ← (verify: tsc zero errors excluding the pre-existing unrelated 3-line debt filtered by the test suite).
- [x] 4.2 `npx jest` passes for `chat-backend/src/webrtc/**/*.spec.ts` and `ChatApp/src/services/webrtc/__tests__/WebRTCService.call.spec.ts` — included new assertions for (a) ghost-ringback suppression, (b) TURN public host mapping, (c) 410 on stale SDP/ICE.
- [x] 4.3 `npm run lint` produces zero new warnings/errors from this change (both `chat-backend` and `ChatApp`).
- [x] 4.4 `npx tsc --noEmit` passes in `ChatApp/` after ringback lifecycle change.

## Verified 2026-08-20 — osf-verify 0 CRITICAL (2 WARNING: env comment drift fixed in this pass; delta apply happens at archive). Manual on-device smoke test pending for ringback audio + TURN public host in real LAN (unit-level only).
