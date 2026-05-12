## Context

The APP_KOOLA call subsystem is architecturally sound but functionally broken. Socket signaling via `/webrtc` namespace with Redis adapter fanout is implemented and tested. `CallSessionService` persists session state in Redis (TTL 3600 s), `TurnService` issues HMAC-SHA1 time-limited TURN credentials, and `CallNotificationsService` sends FCM data-only pushes to offline callees. `CallLogsController` exposes `GET /call-logs` for history, and the mobile `CallsScreen` renders it. `IncomingCallScreen` exists with ringtone + ringing emit + cancel/timeout listeners. `callAudioService` wraps `InCallManager` for ringtone/ringback/audio mode.

What is broken is the glue between these pieces:
- The backend never calls `CallLogsService.createLog()` or `updateLog()` from terminal gateway handlers (accept/decline/cancel/end/timeout). Call history is permanently empty.
- `handleCallInitiate` does not check `getActiveSessionIds(targetUserId)`, so `call_busy` is never emitted and duplicate sessions can be created.
- The `call_initiated` payload carries only `sessionId`, `iceServers`, `targetUserId`, `callType` — no `remoteUser`. The caller's `CallScreen` has no name/avatar to show.
- `useIncomingCall.ts` still uses `Alert.alert` and never navigates to the built-out `IncomingCallScreen`. Ringtone does not play.
- `AndroidManifest.xml` declares only `INTERNET`. `getUserMedia` throws `NotAllowedError` on Android.
- `WebRTCService` has no runtime permission request, no `iceconnectionstatechange` listener, no ICE restart retry logic, no `VALID_TRANSITIONS` state machine, no `isInitiator` guard in `handleRemoteOffer`, no integration with `callAudioService`, and its `setupSocketListeners` does not forward `call_ringing`/`call_cancelled`/`call_timeout`/`call_busy` to the internal emitter.
- The offline FCM push flow is correctly implemented backend-side but has no mobile handler — the push arrives and does nothing.
- `TURN_STATIC_SECRET` defaults to the empty string, producing a deterministic but insecure HMAC.

This is Change 1 of a 3-change sequence. Change 2 adds `react-native-callkeep` + `@notifee/react-native` for lockscreen-native incoming UI; Change 3 adds Picture-in-Picture + in-app call banner. iOS is out of scope (no `ios/` directory exists).

## Goals / Non-Goals

**Goals:**
- Audio and video calls work end-to-end on Android for the online → online case.
- Missed calls, declined calls, cancelled calls, ended calls, and timed-out calls all produce accurate `call-logs` rows with correct `status`, `answeredAt`, `endedAt`, and `duration`.
- Caller's `CallScreen` shows the callee's name + avatar from the moment the call is initiated.
- `call_busy` prevents overlapping sessions when the callee is already on a call.
- ICE failures on transient network flips are recovered via up to 3 ICE-restart attempts.
- The offline FCM push flow shows the `IncomingCallScreen` when the user opens the app within the grace window.
- `TURN_STATIC_SECRET` must be configured — production deployments cannot silently boot with an insecure default.

**Non-Goals:**
- Lockscreen / kill-state incoming call UI (CallKeep + ConnectionService) — Change 2.
- Visible `@notifee` notifications for missed calls — Change 2.
- Picture-in-Picture and in-app call banner — Change 3.
- Group calls UI (grid video, add participant, participant_joined mobile listener) — backend `handleCallJoin` exists for up to 8 participants but no mobile UX is shipped here.
- iOS (no `ios/` directory; CallKit excluded).
- Upgrade audio → video mid-call, screen share, recording, call quality indicators.
- Adaptive video quality via `getStats()` polling.
- Historical call-log backfill. Rows exist only for calls initiated after this change ships.

## Decisions

### D1. Call log inserted on `call_initiate` with default status `missed`

**Choice:** Insert the row with `status='missed'` immediately after the session is created (both online and offline paths), before emitting `call_initiated`. Terminal handlers (accept/decline/cancel/end/timeout/cron cleanup) overwrite the status later.

**Why:**
- Guarantees a row exists for every initiated call. If the gateway process crashes mid-call, the cron service can still flip the row to `missed` based on the stale Redis session.
- Makes `status='missed'` the default — no terminal update needed for the common "callee never answers" case. The online 30-second timeout still writes `endedAt` for consistency.
- Avoids an "initiated" status that has no use in the UI and would require an extra state to the enum.

**Alternatives considered:**
- Insert on accept only → incomplete history (missed calls never recorded).
- Insert an "initiating" status and later transition → needs a new enum value the UI doesn't consume.

### D2. Call log writes are non-blocking

**Choice:** Wrap every `createLog`/`updateLog` call in try/catch, log the error with `logger.error`, never throw. The call continues.

**Why:** Call reliability trumps history completeness. A DB outage must not drop live calls. Logs are reconciled via the cron cleanup.

### D3. SDP race fix via `isInitiator` flag on the client

**Choice:** Add a `private isInitiator: boolean = false` field to `WebRTCService`. Set `true` in `initiateCall()`, `false` in `acceptCall()` and on `cleanup()`. In `handleRemoteOffer`, short-circuit with a warning log when `isInitiator === true`.

**Why:**
- Socket.IO room fanout via the Redis adapter can echo a caller's own `call_offer` back to the caller when both sides are in overlapping rooms. Without the guard, the caller `setRemoteDescription`s its own offer and answers it.
- Fixing this on the server would require role-aware event filtering per participant, complicating the gateway without catching the general class of echo bugs. Client-side `isInitiator` is a 3-line fix and matches the peer-role model.

**Alternatives considered:**
- Filter server-side based on `fromUserId !== currentUserId` per socket. Rejected — the gateway already scopes most events via `user:{id}` rooms; adding per-event caller filtering creates inconsistency.
- Stop listening to `call_offer` on the caller socket after `createAndSendOffer`. Rejected — the caller needs to listen for `call_offer` during ICE restart initiated by the callee (rare but possible).

### D4. ICE restart cap at 3, then `call_failed`

**Choice:** On `iceconnectionstatechange === 'failed'`, if `iceRestartCount < 3`, increment the counter and call `createAndSendOffer(sessionId, { iceRestart: true })`. When the counter hits 3, emit `call_failed` with reason `ice_failed` and cleanup. On `'connected'`, reset the counter.

**Why:** Transient flips (Wi-Fi → 4G, VPN reconnect) typically recover within one restart. Three attempts cover more aggressive flips without infinite-loop risk on hard NAT failure. After the cap, the call fails cleanly so the user can retry manually.

**Alternatives considered:**
- Exponential backoff between attempts. Rejected — ICE restart is idempotent and already imposes its own RTT; an additional backoff would extend perceived outage without benefit.
- Unlimited retries. Rejected — drains battery and masks hard failures.

### D5. Multi-device cancel-on-accept via `except(client.id)`

**Choice:** In `handleCallAccept`, after updating the session state, execute `io.in('user:${userId}').except(client.id).emit('call_cancelled', { sessionId })`.

**Why:**
- Users may have the app on multiple devices. When the push goes out via FCM, every device sees the incoming call.
- Without this, the second device's `IncomingCallScreen` stays open indefinitely after the first device accepts. The `call_cancelled` listener on `IncomingCallScreen` already closes the screen when received.
- Using `except(client.id)` avoids emitting the cancel to the accepting device itself, which has just transitioned to the live call.

### D6. FCM background handler + AsyncStorage pending-call replay

**Choice:** Register `messaging().setBackgroundMessageHandler` at module load (before `AppRegistry.registerComponent`) to persist incoming-call data to `AsyncStorage.pendingIncomingCall` with a `_receivedAt` timestamp. On `App.tsx` mount after auth restores, read the key; if `Date.now() - _receivedAt < 45000`, navigate to `IncomingCallModal` with the replayed params. Always remove the key afterward. Additionally register a foreground handler (`messaging().onMessage`) that navigates directly when the app is running.

**Why:**
- Change 1 does not introduce `react-native-callkeep`, so there is no native surface to receive the push when the app is killed. Without a handler, the push is silently dropped.
- AsyncStorage replay covers the "user opens app shortly after the push" case. The 45 s TTL matches the server's 25 s grace period plus a ~20 s buffer for user reaction.
- Change 2 will replace this with a true ConnectionService path and the replay logic can remain as a fallback for devices where CallKeep registration fails.

**Alternatives considered:**
- Rely only on foreground `onMessage` → kills the offline-push flow entirely for backgrounded apps.
- Use a local notification here. Rejected — that is Change 2's scope (requires `@notifee/react-native`).

### D7. TURN fail-fast outside `NODE_ENV=test`

**Choice:** `TurnService` constructor checks `this.configService.get('TURN_STATIC_SECRET')`. If empty/undefined AND `NODE_ENV !== 'test'`, throw `Error('TURN_STATIC_SECRET must be set for production safety')`. Unit tests may use the placeholder `'test-secret-not-for-prod'`.

**Why:** An empty secret produces a deterministic HMAC that attackers can forge. Crashing at boot is strictly safer than silently shipping insecure credentials. Test environments need a bypass to avoid friction in CI.

### D8. Runtime permission request centralized in `WebRTCService.getLocalStream`

**Choice:** Request `RECORD_AUDIO` (always) and `CAMERA` (video only) via `requestMultiple(...)` from `react-native-permissions` before any `getUserMedia` call. Throw a descriptive error on any non-granted result.

**Why:**
- `getUserMedia` is the only place the app touches mic/camera. Centralizing the permission request keeps the surface area small and testable.
- Audio-only calls don't need camera access; skipping that request avoids a pointless permission prompt.
- Throwing early prevents a half-built peer connection that has no tracks.

### D9. Call state machine with `VALID_TRANSITIONS` guard

**Choice:** Add a `VALID_TRANSITIONS: Record<CallState, CallState[]>` static on `WebRTCService` and a `private transition(next: CallState)` helper. Valid transitions: `idle → initiating`, `initiating → connecting|ended|failed`, `connecting → ringing|active|failed|ended`, `ringing → active|ended|failed`, `active → ended|failed`, `failed → ended`, `ended → idle`. Illegal transitions log a warning and no-op.

**Why:** Prior state drift from event ordering (e.g., `ended` → `ringing` via a late socket event) has produced subtle UI bugs. A guard turns these from silent failures into loggable warnings that can be fixed.

### D10. Icon library — use what's already imported

**Choice:** Inspect `ChatScreen.tsx` imports. Use whichever icon library is already in use. Do not add a new dep. Likely candidates: `react-native-vector-icons/MaterialCommunityIcons` or `lucide-react-native`.

**Why:** Avoids dependency sprawl. The app's UI should feel consistent across screens.

### D11. Icon set for CallScreen

- End call → `PhoneOff` (or equivalent — `call-end` / `phone-hangup`).
- Mute toggle → `Mic` / `MicOff`.
- Camera toggle (video only) → `Video` / `VideoOff`.
- Switch camera (video only) → `SwitchCamera` / `rotate-3d`.
- Speaker toggle → `Volume2` / `VolumeX`.

### D12. `remoteUser` fallback

**Choice:** If `usersService.findById(targetUserId)` returns null, emit `call_initiated` with `remoteUser: { userId: targetUserId, displayName: 'Unknown' }`. On mobile, `CallScreen` falls back to "Đang gọi..." when `remoteUser` is missing entirely.

**Why:** UI functional even in the edge case where the target user was recently deleted. Happy path (99%+) fetches the real user.

## Risks / Trade-offs

- **[TURN fail-fast breaks dev environments without the secret set]** → document in `.env.example` and run `openspec validate` in staging before deploy. CI sets `TURN_STATIC_SECRET=test-secret-not-for-prod` via `NODE_ENV=test`.
- **[45 s pending-call TTL may cause user confusion]** → user opens app too late, no call screen. Correct behavior — the server already marked the call missed at 25 s. UI shows the missed call in history instead. Change 2 fixes this with lockscreen UI.
- **[`react-native-permissions@5` might need native linking]** → runs `npx pod-install` (N/A, no ios) and Gradle rebuild. Auto-linking covers Android in RN 0.76.
- **[ICE restart loop on misbehaving NAT]** → capped at 3. After cap, `call_failed` is emitted and the user sees the end-state.
- **[Historical call logs are never backfilled]** → accepted; users understand calls before the deploy don't appear.
- **[`call-logs` write failures are silent]** → intentional. Errors logged but calls succeed. Monitor via log aggregator.
- **[Multi-device cancel race if accept arrives before the FCM push to device B]** → `IncomingCallScreen` on device B may not be mounted yet when `call_cancelled` fires. Acceptable because `navigationRef.navigate` on the push trigger will be a no-op once the session is already `active`. Worst case: flash of IncomingCallScreen that immediately dismisses via the listener.
- **[Icon library auto-detect may fail if ChatScreen uses ad-hoc icons]** → fallback to `react-native-vector-icons/MaterialCommunityIcons` which is a common RN dep. Verify before proceeding with `grep -R 'from .react-native-vector-icons\|from .lucide-react-native' ChatApp/src`.

## Migration Plan

1. Ship backend changes first (call-log lifecycle + busy + remoteUser + TURN validation + cron update). Backward compatible — existing clients keep working; new clients get `remoteUser` / `call_busy`.
2. Set `TURN_STATIC_SECRET` in all backend deploy configs before rolling out the TURN fail-fast commit.
3. Ship mobile changes. Each mobile user on an older client continues to work against the new backend until they update the app.
4. No DB migration. `call-logs` collection starts receiving rows after deploy.
5. Rollback: revert both backend and mobile. `call-logs` rows written during the rollout window are orphaned but harmless — they simply age out of relevance.

## Open Questions

None for Change 1. All decisions are locked in the autopilot caller context. Change 2 and Change 3 will resolve lockscreen + PiP semantics.
