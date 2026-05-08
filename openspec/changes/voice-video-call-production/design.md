## Context

The WebRTC signaling infrastructure (gateway, Redis session service, TURN service, DTOs, module) is already operational. The React Native side has a working peer connection, SDP exchange, signal buffering, and a basic CallScreen. However, the system is missing all production-level behaviors: calls never time out on the server, callers cannot cancel before pickup, there is no busy detection or multi-device logic, the incoming call UI is a blocking Alert dialog, audio routing is entirely unmanaged, connection failures are not recovered, and call history is not stored.

The system runs NestJS 11 with Socket.IO on a `/webrtc` namespace, backed by Redis for ephemeral session state. Call logs must be stored in MongoDB (separate from ephemeral sessions). The React Native client uses react-native-webrtc for peer connections.

---

## Goals / Non-Goals

**Goals:**

- Complete the signaling event contract (cancel, busy, ringing ACK, multi-device dismiss, double-call guard, server-side timeout)
- Persist call records to MongoDB for history and analytics
- Replace the Alert-based incoming call UI with a full-screen modal that manages audio
- Enforce a validated state machine on the client to prevent illegal transitions
- Add ICE restart for transient connection failures
- Add basic adaptive video quality reduction under poor network conditions
- Expose camera switch and call cancel through the hook and screen layer
- Add a Calls tab screen powered by the REST call-log endpoint

**Non-Goals:**

- Screen sharing or group calls
- End-to-end encryption of media streams (DTLS/SRTP is handled by the WebRTC stack natively)
- Call recording
- VoIP background call handling via CallKit (iOS) or ConnectionService (Android) — full integration deferred; basic foreground audio is the target
- Coturn server provisioning changes

---

## Decisions

### D1: Server timeout via in-memory Map, not Redis keyspace notifications

**Decision:** Store timeout handles in a `Map<sessionId, NodeJS.Timeout>` inside the gateway class. Check session state after 30 seconds using `setTimeout`.

**Rationale:** Redis keyspace notifications require additional Redis configuration (`notify-keyspace-events KEx`) and introduce a second subscriber connection. The gateway is already the authoritative coordinator for a session during its lifetime; an in-memory handle is simpler and sufficient. The handle is cleared on any terminal event (accept, decline, end, cancel). On a server crash the Redis TTL already cleans up the session key, and the client's own connection-drop handling covers the orphan case.

**Alternative considered:** Bull/BullMQ delayed job — adds a dependency and queue infrastructure for a 30-second window, excessive.

### D2: CallLogs in MongoDB, not Redis

**Decision:** Persistent call records live in a dedicated `call-logs` MongoDB collection. Redis holds only the live ephemeral session.

**Rationale:** Redis session data is intentionally short-lived (TTL-based). History requires indefinite retention, pagination, and cross-session queries by user. MongoDB already stores all other persistent app data (messages, conversations, users).

**Schema key fields:** `sessionId` (indexed), `initiatorId` (indexed), `targetUserId` (indexed), `conversationId`, `callType` (audio|video), `status` (ended|missed|declined|busy|failed), `startedAt`, `answeredAt`, `endedAt`, `duration` (seconds, computed on close).

### D3: IncomingCallScreen as a RootNavigator fullScreenModal

**Decision:** Register `IncomingCallModal` in `RootNavigator` with `presentation: 'fullScreenModal'`. `useIncomingCall` navigates to it on `incoming_call`. The screen itself listens for dismiss events (cancelled, timeout).

**Rationale:** A true full-screen overlay (above tab bars and stack navigators) is required. React Navigation's `fullScreenModal` presentation achieves this without a custom native module. Keeping it as a named route means it participates in the normal navigation lifecycle (back gesture, deep link safety).

**Alternative considered:** A React Native `Modal` component rendered from a root provider — harder to test, no back-gesture safety, harder to manage navigation state.

### D4: Audio management via a thin callAudioService wrapper over react-native-incall-manager

**Decision:** Create `callAudioService.ts` as a thin singleton that delegates to `react-native-incall-manager`. All WebRTC hook and screen code calls this service rather than InCallManager directly.

**Rationale:** Centralizes audio-mode transitions so the WebRTC hook and the IncomingCallScreen cannot put the device in conflicting states. Makes the manager mockable in tests.

**react-native-incall-manager responsibilities:**
- `startRingback()` for caller waiting state
- `startRingtone()` + vibration for callee
- `stop()` on any terminal event
- `setForceSpeakerphoneOn(bool)` for speaker toggle
- `setSpeakerphoneOn(bool)` — proximity sensor auto-handled by the lib

### D5: ICE restart bounded to 2 attempts

**Decision:** On `iceconnectionstatechange === 'failed'`, the client calls `createOffer({ iceRestart: true })` and re-signals. A counter limits this to 2 attempts. After 2 failures, emit `call_failed` and transition to `failed` state.

**Rationale:** ICE restart is the correct WebRTC mechanism for transient TURN path failures. Bounding retries prevents infinite loops and ensures the call ends deterministically on a genuinely broken path.

### D6: Adaptive video quality via getStats polling

**Decision:** Poll `peerConnection.getStats()` every 5 seconds when a video call is active. If packet loss exceeds 5% over two consecutive polls, apply a 320x240 video constraint. Restore to 640x480 after two consecutive clean polls.

**Rationale:** getStats is the standard, cross-platform way to observe media quality without external libraries. Two-poll hysteresis prevents oscillation on short-term jitter.

**Non-goal at this stage:** Per-track bandwidth capping via SDP manipulation — too complex for initial production cut.

### D7: Call state machine enforced in webrtcService, not in the hook

**Decision:** State transitions are validated inside `webrtcService.ts`. The hook exposes the current state as a read-only value. Illegal transitions are logged and ignored.

**Valid transitions:**
```
idle          → initiating   (on initiateCall)
initiating    → ringing      (on call_ringing received)
ringing       → connecting   (on call_accepted)
connecting    → active       (on ICE connected)
active        → ended        (on call_end / hangup)
initiating    → ended        (on call_cancelled / call_busy / hangup)
ringing       → ended        (on call_cancelled / call_busy / hangup)
connecting    → failed       (on ICE failed after retries)
failed        → ended        (on explicit end or timeout)
any           → ended        (on call_declined / call_timeout)
```

---

## Risks / Trade-offs

**[Risk] In-memory timeout handles lost on server restart** → Mitigation: The Redis TTL (60s) on the session key remains as the fallback. The client also has a local timeout UI after 45s. The window of inconsistency (server restarted between 0–30s) is small and self-resolving.

**[Risk] Multi-device cancel via `io.in('user:${userId}').except(client.id).emit()` requires user-room join** → Mitigation: Confirm the gateway already joins `user:<userId>` rooms on connection. If not, this must be added in the gateway's `handleConnection` method before the multi-device logic is wired up.

**[Risk] react-native-incall-manager native build issues on new Android toolchain** → Mitigation: Pin to a known-good version compatible with React Native 0.76. Verify build in Android emulator before merging.

**[Risk] getStats polling adds CPU overhead during video calls** → Mitigation: Only start the polling interval when call state is `active` and call type is `video`. Clear the interval on any terminal state.

**[Risk] ICE restart re-signaling race with an in-flight hangup** → Mitigation: Guard the ICE restart handler with a state check — only attempt restart if current state is `active`.

**[Risk] CallLogs duration computation on unexpected termination** → Mitigation: The gateway computes duration as `endedAt - answeredAt` in milliseconds when closing a log. If `answeredAt` is null (missed/declined/busy), duration is set to 0.

---

## Migration Plan

1. Add `react-native-incall-manager` to `ChatApp/package.json` and run `npm install`.
2. Deploy backend changes: new `call-logs` module, updated gateway handlers. Gateway changes are additive (new event names do not break existing clients that ignore unknown events).
3. Deploy updated mobile app. The `IncomingCallScreen` registration in `RootNavigator` is additive.
4. No database migrations needed — the new `call-logs` collection is created automatically by Mongoose on first write.
5. No breaking changes to existing socket event names. All new events (`call_cancel`, `call_ringing`, `call_busy`, `call_missed`, `call_timeout`, `call_cancelled`) are net-new.

**Rollback:** Remove the new gateway handlers and revert `useIncomingCall` to Alert-based flow. No data migration needed since call-log collection can be dropped without affecting other collections.

---

## Open Questions

- Does the backend gateway currently join `user:<userId>` rooms on socket connection? This is required for multi-device cancel (D6). Must be verified before implementing that feature.
- Should `GET /call-logs` be scoped to conversations the user is a member of, or globally to any call where the user is initiator or target? (Current design: filter by `userId` as either initiator or target.)
- iOS foreground-only vs. background CallKit integration — confirm iOS is not in scope for this sprint before finalizing the IncomingCallScreen approach.
