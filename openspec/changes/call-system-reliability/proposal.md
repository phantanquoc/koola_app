## Why

Audio and video calling is the largest non-functional surface in the app today. Prior work on `voice-video-call-production` shipped 65 of 70 tasks as "done" but ~15 of them are "ghost-done" — the tasks were checked off without real code. On Android, calls fail immediately because `AndroidManifest.xml` is missing `CAMERA` and `RECORD_AUDIO` permissions; even if permissions were granted, `useIncomingCall` still shows an `Alert.alert` instead of navigating to the fully-built `IncomingCallScreen`; and call history is permanently empty because `CallLogsService.createLog()` is never invoked anywhere in the backend. Additional latent failures block reliable calling: the caller echoes its own SDP offer back on itself (SDP race), ICE restart on network flips is unimplemented, `call_busy` is never emitted when the callee is already in a call, `TURN_STATIC_SECRET` silently defaults to an empty HMAC key, the offline FCM push has no mobile handler, and terminal call handlers never persist status or duration. This change restores audio + video calling to a working, auditable state on Android before layering on lockscreen UI (Change 2) and PiP (Change 3).

## What Changes

- **Backend — call log lifecycle**: persist a row on `call_initiate` (default status `missed`) and overwrite status on accept (`answered` + `answeredAt`), decline (`declined`), cancel (`cancelled`), end (`ended` + computed duration), timeout/grace expiry (`missed`), and cron cleanup (`missed`). Non-blocking writes (try/catch, no throw).
- **Backend — busy detection**: reject `call_initiate` when the target has any active session via `getActiveSessionIds(targetUserId)`; emit `call_busy` to caller; do not create a session or send a push.
- **Backend — caller UX parity**: fetch the target user inside `handleCallInitiate` and include `remoteUser: {userId, displayName, avatar}` in the `call_initiated` payload so the caller's `CallScreen` shows a name/avatar.
- **Backend — multi-device cancel-on-accept**: when one device accepts, emit `call_cancelled` to the rest of the user's sockets via `io.in(room).except(client.id).emit(...)` so other devices dismiss the IncomingCallScreen.
- **Backend — TURN fail-fast**: `TurnService` refuses to start if `TURN_STATIC_SECRET` is unset outside of `NODE_ENV=test`.
- **Backend — unit tests**: new `webrtc.gateway.call-log.spec.ts` proves createLog/updateLog are called on every terminal branch, createLog failures don't block session creation, `remoteUser` appears in `call_initiated`, and multi-device cancel is emitted on accept.
- **Mobile — Android manifest**: declare `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `BLUETOOTH`/`BLUETOOTH_CONNECT`, `FOREGROUND_SERVICE` + `*_MICROPHONE`/`*_CAMERA`, `WAKE_LOCK`; add `android:showWhenLocked` + `android:turnScreenOn` on `MainActivity`.
- **Mobile — runtime permissions**: install `react-native-permissions@^5`. `WebRTCService.getLocalStream` requests `RECORD_AUDIO` (always) and `CAMERA` (video calls only) via `requestMultiple` and throws on any non-granted result before calling `getUserMedia`.
- **Mobile — replace Alert with IncomingCallScreen**: `useIncomingCall` navigates to `IncomingCallModal` with full payload (`sessionId`, `callType`, `remoteUser`, `iceServers`); Alert path removed.
- **Mobile — WebRTC state machine + SDP race fix**: `WebRTCService` gets a `VALID_TRANSITIONS` guard, an `isInitiator` flag so the caller ignores its own offer echoes, and listeners for `call_ringing`, `call_cancelled`, `call_timeout`, `call_busy` that forward to the internal emitter.
- **Mobile — ICE restart protocol**: on `iceconnectionstatechange === 'failed'`, `WebRTCService` retries up to 3 times with `createOffer({iceRestart:true})`; after the cap, it emits `call_failed` and cleans up.
- **Mobile — in-call audio wiring**: `WebRTCService` calls `callAudioService.startRingback/setVoiceMode` on initiate and `stop()` on terminal; `CallScreen` gets speaker toggle via new `callAudioService.setSpeakerphoneOn(on)`.
- **Mobile — CallScreen polish**: read `remoteUser` from route params, render UserAvatar + displayName; replace text-icon buttons with proper icons; add Switch Camera (video) + Speaker toggle.
- **Mobile — FCM background handler**: new `fcmCallHandler.ts` registers a background handler that persists incoming_call payloads to `AsyncStorage.pendingIncomingCall` (45 s TTL) and a foreground handler that navigates directly; `App.tsx` replays a pending call on mount; `index.js` registers the background handler before `AppRegistry`.

## Capabilities

### New Capabilities

- `call-history`: lifecycle of persisted call logs — when rows are created, which terminal handlers update which fields, how duration is computed, how cron cleanup backfills missed calls.
- `mobile-permissions`: runtime + manifest permission policy for microphone and camera on Android; behavior when the user denies permission.
- `turn-config`: startup-time validation for TURN credentials; fail-fast policy when the HMAC secret is missing.

### Modified Capabilities

- `webrtc-offline-call-push`: adds the mobile-side background FCM handler + AsyncStorage replay that the original offline-push design assumed but never implemented; adds the `call_busy` event, the `remoteUser` field on `call_initiated`, multi-device cancel-on-accept semantics, the caller-side listener surface for `call_ringing`/`call_cancelled`/`call_timeout`/`call_busy`, and the ICE restart retry protocol.

## Impact

- **Backend code**: `src/webrtc/webrtc.gateway.ts`, `src/webrtc/services/turn.service.ts`, `src/webrtc/services/call-session-cron.service.ts`, `src/webrtc/webrtc.module.ts` (ensure `CallLogsService` is injectable if not already), new `src/webrtc/webrtc.gateway.call-log.spec.ts`.
- **Mobile code**: `android/app/src/main/AndroidManifest.xml`, `src/services/webrtc/WebRTCService.ts`, `src/services/audio/callAudioService.ts`, `src/hooks/useIncomingCall.ts`, `src/screens/chat/ChatScreen.tsx`, `src/screens/call/CallScreen.tsx`, `src/navigation/types.ts`, new `src/services/push/fcmCallHandler.ts`, `App.tsx`, `index.js`, `package.json` + `package-lock.json` (adds `react-native-permissions`).
- **APIs / socket events**: no REST changes. Socket changes are additive — new events on the caller-side listener surface (`call_busy`, listener fanout for events that already existed server-side) and an additional `remoteUser` field on `call_initiated`.
- **Data**: no schema changes to Mongoose models. `call-logs` collection now receives rows it never received before; historical backfill is not attempted.
- **Infra**: backends with unset `TURN_STATIC_SECRET` will fail to boot after this change. Deployment pipelines must ensure the secret is set.
- **Dependencies**: `react-native-permissions@^5` added on mobile; no new backend deps.
- **Out of scope for this change (reserved for follow-ups)**: react-native-callkeep + @notifee/react-native (lockscreen UI — Change 2), Picture-in-Picture + in-app call banner (Change 3), group call UI, iOS.
