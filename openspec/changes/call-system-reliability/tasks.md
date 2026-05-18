## 1. Backend — Call Log Lifecycle

- [x] 1.1 Verify `CallLogsService` is already injected in `WebrtcGateway` constructor (should be present from earlier work)
- [x] 1.2 In `handleCallInitiate` online branch: after `callSessionService.createSession()` succeeds and BEFORE emitting `call_initiated`, call `callLogsService.createLog({sessionId, initiatorId: callerId, targetUserId, conversationId, callType, status: 'missed', startedAt: new Date()})`, wrapped in try/catch that logs via `this.logger.error` but does NOT throw
- [x] 1.3 In `handleCallInitiate` offline-push branch: after `callSessionService.createSession()` succeeds and BEFORE sending the FCM push, call the same `createLog` with try/catch (same behaviour as 1.2)
- [x] 1.4 In `handleCallInitiate` "no FCM tokens" sub-branch: also call `createLog` before emitting `call_missed` so the immediate-missed case still produces a row
- [x] 1.5 In `handleCallAccept` after `updateSessionState('active')`: call `callLogsService.updateLog(sessionId, {status: 'answered', answeredAt: new Date()})` in try/catch
- [x] 1.6 In `handleCallDecline` after `updateSessionState('declined')`: call `updateLog(sessionId, {status: 'declined', endedAt: new Date(), duration: 0})` in try/catch
- [x] 1.7 In `handleCallCancel` after `endSession`: call `updateLog(sessionId, {status: 'cancelled', endedAt: new Date(), duration: 0})` in try/catch
- [x] 1.8 In `handleCallEnd` after `endSession`: read `findBySessionId(sessionId)` to get `answeredAt`; compute `duration = answeredAt ? Math.floor((Date.now() - answeredAt.getTime())/1000) : 0`; call `updateLog(sessionId, {status: 'ended', endedAt: new Date(), duration})` in try/catch
- [x] 1.9 In the online 30s timeout `setTimeout` callback: after `updateSessionState('missed')`, call `updateLog(sessionId, {status: 'missed', endedAt: new Date(), duration: 0})` in try/catch
- [x] 1.10 In the offline-push 25s grace `setTimeout` callback: after `endSession`, call `updateLog(sessionId, {status: 'missed', endedAt: new Date(), duration: 0})` in try/catch
- [x] 1.11 In `handleDisconnect` auto-end loop: after `endSession`, call `updateLog(sessionId, {status: 'ended', endedAt: new Date(), duration: <computed>})` in try/catch
- [x] 1.12 In `CallSessionCronService`: after `cleanupStaleSessions()` returns the cleaned list, for each cleaned session call `callLogsService.updateLog(session.sessionId, {status: 'missed', endedAt: new Date(), duration: 0})` in try/catch. Inject `CallLogsService` into the cron service if not already present ← (verify: every terminal handler (accept/decline/cancel/end/online-timeout/offline-timeout/disconnect/cron) writes to call-logs; createLog failure in handleCallInitiate does NOT block session creation or event emit)

## 2. Backend — Busy Detection

- [x] 2.1 In `handleCallInitiate`: BEFORE `callSessionService.hasExistingSession(callerId, targetUserId, conversationId)` check, call `getActiveSessionIds(targetUserId)`. If the returned array length > 0, emit `call_busy` to `client` with payload `{targetUserId}` and return immediately. Do NOT create a session, do NOT send a push, do NOT create a call-logs row
- [x] 2.2 Additionally, call `hasExistingSession(targetUserId, callerId, conversationId)` for the reverse direction (B→A on same conversation). If non-null, emit `call_busy` with payload `{targetUserId}` and return
- [x] 2.3 Ensure logging: `this.logger.log('[WebrtcGateway] call_busy: <callerId> → <targetUserId> (reason: <target_active|reverse_initiated>)')` ← (verify: gateway returns before createSession on busy; no call-logs row written on busy; caller's `call_busy` listener receives the event)

## 3. Backend — Caller UX Parity (remoteUser)

- [x] 3.1 In `handleCallInitiate`, after busy checks pass and BEFORE the online/offline branch split: fetch `const target = await this.usersService.findById(targetUserId);`
- [x] 3.2 Build `remoteUserInfo = {userId: targetUserId, displayName: target?.displayName ?? target?.email ?? 'Unknown', avatar: target?.avatar}` (D12 fallback). If avatar is undefined, set the field to null for consistent JSON
- [x] 3.3 In the online branch, include `remoteUser: remoteUserInfo` in the `call_initiated` emit to caller
- [x] 3.4 In the offline-push branch, include `remoteUser: remoteUserInfo` in the `call_initiated` emit to caller (existing payload: `{sessionId, iceServers, targetUserId, callType}`)
- [x] 3.5 Keep the existing `fromUser` field in the `incoming_call` event unchanged (callee-facing payload)

## 4. Backend — Multi-Device Cancel on Accept

- [x] 4.1 In `handleCallAccept`, after `updateSessionState('active')` and BEFORE the `call_accepted` emit to initiator: execute `this.io.in(`user:${userId}`).except(client.id).emit('call_cancelled', {sessionId})` where `userId = client.data.user!.sub`
- [x] 4.2 Add a comment referencing D5 rationale so future readers understand why `except(client.id)` is required
- [x] 4.3 Verify `handleConnection` already joins `user:<userId>` room (existing code at webrtc.gateway.ts:77 does this — confirm unchanged) ← (verify: accepting socket does NOT receive call_cancelled; other sockets in same user:<id> room DO receive it)

## 5. Backend — TURN Fail-Fast

- [x] 5.1 In `TurnService` constructor: after reading `TURN_STATIC_SECRET`, check `if (!this.coturnSecret && process.env.NODE_ENV !== 'test')` and throw `new Error('TURN_STATIC_SECRET must be set for production safety')`
- [x] 5.2 Create/update `chat-backend/src/webrtc/services/turn.service.spec.ts`:
  - Test: constructor throws when secret empty and NODE_ENV=production
  - Test: constructor throws when secret undefined and NODE_ENV=development
  - Test: constructor OK when secret empty and NODE_ENV=test
  - Test: constructor OK when secret is set regardless of NODE_ENV
  - Test: `generateCredentials` produces `<epoch+3600>:<userId>` username and base64 HMAC-SHA1 password
- [x] 5.3 Update `chat-backend/.env.example` (create if missing): add `TURN_STATIC_SECRET=` with a comment `# REQUIRED. Long random string. Server refuses to start in non-test envs if empty.` ← (verify: backend fails to boot in non-test env without secret; boots fine with secret; tests pass without secret)

## 6. Backend — Unit Tests

- [x] 6.1 Create `chat-backend/src/webrtc/webrtc.gateway.call-log.spec.ts` with Jest test suite; set up `describe('WebrtcGateway — call log lifecycle')` with `beforeEach` that mocks `CallLogsService`, `CallSessionService`, `TurnService`, `CallNotificationsService`, `UsersService`, `MembershipService`, `RedisService`, `JwtService`, and an `io` Server mock with `.in().except().emit()` chain
- [x] 6.2 Test: `handleCallInitiate` (online) → `CallLogsService.createLog` is called once with `{status: 'missed', ...}` after session creation
- [x] 6.3 Test: `handleCallInitiate` (offline with tokens) → `createLog` is called once with `{status: 'missed', ...}` before FCM send
- [x] 6.4 Test: `handleCallInitiate` (offline no tokens) → `createLog` is called once; `call_missed` is emitted to caller
- [x] 6.5 Test: `handleCallInitiate` busy (target has active) → `createLog` is NOT called; `call_busy` emitted to caller
- [x] 6.6 Test: `handleCallAccept` → `updateLog(sessionId, {status: 'answered', answeredAt: <Date>})` called once
- [x] 6.7 Test: `handleCallDecline` → `updateLog(sessionId, {status: 'declined', endedAt: <Date>, duration: 0})` called once
- [x] 6.8 Test: `handleCallCancel` → `updateLog(sessionId, {status: 'cancelled', endedAt: <Date>, duration: 0})` called once
- [x] 6.9 Test: `handleCallEnd` with prior answeredAt → `updateLog` called with status='ended' and duration computed from `Date.now() - answeredAt`
- [x] 6.10 Test: `handleCallEnd` with answeredAt=null → `updateLog` called with duration=0
- [x] 6.11 Test: online timeout callback (use `jest.useFakeTimers`, advance 30s) → `updateLog({status: 'missed', ...})` is called
- [x] 6.12 Test: `createLog` throwing → gateway continues: `call_initiated` is still emitted to caller, session is still created
- [x] 6.13 Test: `call_initiated` payload contains `remoteUser` with `displayName` and `avatar` from mocked UsersService
- [x] 6.14 Test: `handleCallInitiate` with target busy emits `call_busy` with `{targetUserId}` and does NOT create session
- [x] 6.15 Test: `handleCallAccept` → `io.in('user:<userId>').except(client.id).emit('call_cancelled', {sessionId})` is called exactly once ← (verify: all 14 tests pass; mocks assert exact call count and argument shape; no flaky timer tests)

## 7. Mobile — AndroidManifest

- [x] 7.1 Edit `ChatApp/android/app/src/main/AndroidManifest.xml`: add `<uses-permission android:name="android.permission.CAMERA" />` and `android.permission.RECORD_AUDIO`, `android.permission.MODIFY_AUDIO_SETTINGS`, `android.permission.BLUETOOTH`, `android.permission.BLUETOOTH_CONNECT`, `android.permission.FOREGROUND_SERVICE`, `android.permission.FOREGROUND_SERVICE_MICROPHONE`, `android.permission.FOREGROUND_SERVICE_CAMERA`, `android.permission.WAKE_LOCK`
- [x] 7.2 Add `android:showWhenLocked="true"` and `android:turnScreenOn="true"` to the `<activity android:name=".MainActivity" ...>` element ← (verify: `aapt dump permissions` on built APK shows all 9 added permissions; MainActivity element contains both `showWhenLocked` and `turnScreenOn`)

## 8. Mobile — Runtime Permissions

- [x] 8.1 Add `react-native-permissions@^5.0.0` to `ChatApp/package.json` dependencies and run `npm install` inside `ChatApp/`
- [x] 8.2 In `ChatApp/src/services/webrtc/WebRTCService.ts`: import `{check, request, requestMultiple, PERMISSIONS, RESULTS}` from `react-native-permissions` and `Platform` from `react-native`
- [x] 8.3 In `getLocalStream(callType)`: at the start, if `Platform.OS === 'android'`, build `const perms = callType === 'video' ? [PERMISSIONS.ANDROID.RECORD_AUDIO, PERMISSIONS.ANDROID.CAMERA] : [PERMISSIONS.ANDROID.RECORD_AUDIO]`
- [x] 8.4 Call `const result = await requestMultiple(perms);` and iterate `for (const p of perms)`: if `result[p] !== RESULTS.GRANTED`, throw `new Error(`Permission denied: ${p}`)` before `mediaDevices.getUserMedia`
- [x] 8.5 On non-Android (`Platform.OS !== 'android'`), skip the permission gate and proceed directly to `getUserMedia` ← (verify: denying microphone throws before getUserMedia; audio call only requests RECORD_AUDIO; video call requests both)

## 9. Mobile — useIncomingCall → IncomingCallScreen

- [x] 9.1 Edit `ChatApp/src/hooks/useIncomingCall.ts`: remove `import {Alert} from 'react-native'` and all Alert-based code inside `handleIncomingCall`
- [x] 9.2 Replace the Alert block with: `if (navigationRef.isReady()) { (navigationRef.navigate as any)('IncomingCallModal', {sessionId: call.sessionId, callType: call.callType, remoteUser: {id: call.fromUser?.userId ?? call.fromUserId, displayName: call.fromUser?.displayName ?? 'Unknown', avatar: call.fromUser?.avatar}, iceServers: call.iceServers}); }`
- [x] 9.3 Keep the `webrtcService.connect(token)` and `webrtcService.on('incoming_call', handleIncomingCall)` wiring unchanged
- [x] 9.4 Do NOT call `webrtcService.acceptCall` or `declineCall` in the hook anymore — `IncomingCallScreen` handles those buttons ← (verify: `Alert` import removed from useIncomingCall; navigation to IncomingCallModal fires with correct params on socket `incoming_call` event)

## 10. Mobile — WebRTCService State Machine + SDP Race Fix

- [x] 10.1 Add private fields to `WebRTCService`: `private callState: CallState = 'idle'`, `private isInitiator: boolean = false`, `private iceRestartCount: number = 0`, `private currentSessionId: string | null = null`
- [x] 10.2 Add a static readonly `VALID_TRANSITIONS: Record<CallState, CallState[]>` implementing D9: `idle→[initiating]`, `initiating→[connecting,ended,failed]`, `connecting→[ringing,active,failed,ended]`, `ringing→[active,ended,failed]`, `active→[ended,failed]`, `failed→[ended]`, `ended→[idle]`
- [x] 10.3 Add `private transition(next: CallState): boolean` — check `VALID_TRANSITIONS[this.callState].includes(next)`; if false, `console.warn('[WebRTC] Invalid transition:', this.callState, '→', next)` and return false; if true, update `this.callState = next`, emit internal `call_state_changed` with new state, return true
- [x] 10.4 In `initiateCall(targetUserId, conversationId, callType)`: set `this.isInitiator = true`, call `this.transition('initiating')`, then `this.socket?.emit('call_initiate', {...})`
- [x] 10.5 In `acceptCall(sessionId)`: set `this.isInitiator = false`, `this.currentSessionId = sessionId`
- [x] 10.6 In `cleanup()`: set `this.isInitiator = false`, `this.iceRestartCount = 0`, `this.currentSessionId = null`; if current state is not `ended`, `this.transition('ended')`; then `this.transition('idle')`
- [x] 10.7 In `handleRemoteOffer(data)`: if `this.isInitiator === true`, `console.warn('[WebRTC] Ignoring echoed offer on initiator side for session', data.sessionId)` and return early without setting remote description or creating answer
- [x] 10.8 Store `currentSessionId` when `initiateCall` fires (assign from server's `call_initiated` listener payload) and when `acceptCall` is called ← (verify: invalid transitions log warning and no-op; caller echoed offer is ignored; currentSessionId is populated for ICE restart to use)

## 11. Mobile — Socket Listener Forwarding

- [x] 11.1 In `setupSocketListeners` of `WebRTCService`: add `this.socket.on('call_ringing', (data) => this.emit('call_ringing', data))`
- [x] 11.2 Add `this.socket.on('call_cancelled', (data) => this.emit('call_cancelled', data))`
- [x] 11.3 Add `this.socket.on('call_timeout', (data) => this.emit('call_timeout', data))`
- [x] 11.4 Add `this.socket.on('call_busy', (data) => this.emit('call_busy', data))`
- [x] 11.5 Add `this.socket.on('call_failed', (data) => this.emit('call_failed', data))`
- [x] 11.6 Keep existing listeners (`incoming_call`, `call_initiated`, `call_accepted`, `call_declined`, `call_ended`, `call_missed`, `call_offer`, `call_answer`, `call_ice_candidate`, `error`) unchanged ← (verify: `IncomingCallScreen.on('call_cancelled')` and `on('call_timeout')` fire; `ChatScreen` caller-side receives `call_busy`)

## 12. Mobile — ICE Restart

- [x] 12.1 In `createPeerConnection`: after the existing `connectionstatechange` listener, add `this.peerConnection.addEventListener('iceconnectionstatechange', () => { ... })`
- [x] 12.2 Inside the handler, read `const state = this.peerConnection?.iceConnectionState;`
- [x] 12.3 If `state === 'connected'`: reset `this.iceRestartCount = 0`
- [x] 12.4 If `state === 'failed'` AND `this.callState === 'active'`:
  - If `this.iceRestartCount < 3`: increment counter, `const offer = await this.peerConnection.createOffer({iceRestart: true}); await this.peerConnection.setLocalDescription(offer); this.socket?.emit('call_offer', {sessionId: this.currentSessionId, sdp: offer});` with try/catch logging any error
  - Else (counter >= 3): `this.socket?.emit('call_failed', {sessionId: this.currentSessionId}); this.transition('failed'); this.cleanup();`
- [x] 12.5 Log each restart attempt: `console.log('[WebRTC] ICE restart attempt', this.iceRestartCount, 'for session', this.currentSessionId)` ← (verify: single Wi-Fi flip recovers without user action; hard failure emits call_failed after 3 attempts; counter resets on connected)

## 13. Mobile — In-Call Audio Wiring

- [x] 13.1 Import `callAudioService` from `../audio/callAudioService` at the top of `WebRTCService.ts`
- [x] 13.2 In `initiateCall` after `this.socket?.emit('call_initiate', ...)`: call `callAudioService.startRingback()`
- [x] 13.3 In `setupSocketListeners` `call_accepted` handler (existing): also call `callAudioService.stopRingback(); callAudioService.setVoiceMode();` before the `this.emit('call_accepted', data)` forward
- [x] 13.4 In `cleanup()`: call `callAudioService.stop()` as first line
- [x] 13.5 In `transition('failed')` path or wherever state becomes `failed`: ensure `callAudioService.stop()` is called ← (verify: caller hears ringback while ringing; ringback stops on accept; voice mode routes audio to earpiece on active; all audio stops on end/failed)

## 14. Mobile — CallScreen Icon Polish

- [x] 14.1 In `ChatApp/src/screens/call/CallScreen.tsx`: import `import MaterialIcons from 'react-native-vector-icons/MaterialIcons';`
- [x] 14.2 Replace mute button `<Text>{isMuted ? 'M' : 'M'}</Text>` with `<MaterialIcons name={isMuted ? 'mic-off' : 'mic'} size={28} color="#fff" />`
- [x] 14.3 Replace speaker button `<Text>S</Text>` with `<MaterialIcons name={isSpeakerOn ? 'volume-up' : 'volume-off'} size={28} color="#fff" />`
- [x] 14.4 Replace end button `<Text>End</Text>` with `<MaterialIcons name="call-end" size={28} color="#fff" />`
- [x] 14.5 Replace camera toggle `<Text>Cam</Text>` with `<MaterialIcons name={isCameraOff ? 'videocam-off' : 'videocam'} size={28} color="#fff" />`
- [x] 14.6 Replace switch camera `<Text>Flip</Text>` with `<MaterialIcons name="flip-camera-android" size={28} color="#fff" />`
- [x] 14.7 Verify `remoteUser` from `route.params` renders UserAvatar and displayName (already in place — confirm unchanged)
- [x] 14.8 Also replace text icons in `ChatApp/src/screens/call/IncomingCallScreen.tsx`: decline `'X'` → `<MaterialIcons name="call-end" />`, accept `'V'`/`'A'` → `<MaterialIcons name={callType === 'video' ? 'videocam' : 'call'} />` ← (verify: CallScreen and IncomingCallScreen render MaterialIcons glyphs, not text letters; avatars appear)

## 15. Mobile — FCM Background Handler

- [x] 15.1 Create `ChatApp/src/services/push/fcmCallHandler.ts`
- [x] 15.2 Define `export interface PendingIncomingCall { sessionId: string; callerId: string; callerName: string; callerAvatar?: string; callType: 'audio' | 'video'; conversationId: string; expiresAt: number; _receivedAt: number; }`
- [x] 15.3 Export `registerFcmCallBackgroundHandler()`: call `messaging().setBackgroundMessageHandler(async (remoteMessage) => { const data = remoteMessage.data ?? {}; if (data.type !== 'incoming_call') return; const payload: PendingIncomingCall = {sessionId: String(data.sessionId), callerId: String(data.callerId), callerName: String(data.callerName), callerAvatar: data.callerAvatar ? String(data.callerAvatar) : undefined, callType: data.callType as 'audio'|'video', conversationId: String(data.conversationId), expiresAt: Number(data.expiresAt), _receivedAt: Date.now()}; await AsyncStorage.setItem('pendingIncomingCall', JSON.stringify(payload)); })`
- [x] 15.4 Export `registerFcmCallForegroundHandler(navigate: (params: any) => void)`: call `messaging().onMessage(async (remoteMessage) => { const data = remoteMessage.data ?? {}; if (data.type !== 'incoming_call') return; navigate({sessionId: String(data.sessionId), callType: data.callType, remoteUser: {id: String(data.callerId), displayName: String(data.callerName), avatar: data.callerAvatar ? String(data.callerAvatar) : undefined}}); })`
- [x] 15.5 Export `async function consumePendingIncomingCall(): Promise<PendingIncomingCall | null>`: read `AsyncStorage.getItem('pendingIncomingCall')`; always call `AsyncStorage.removeItem('pendingIncomingCall')` afterwards; parse JSON; if `Date.now() - payload._receivedAt < 45000` return payload, else return null
- [x] 15.6 In `ChatApp/index.js`: import `registerFcmCallBackgroundHandler` from `./src/services/push/fcmCallHandler` and call it BEFORE `AppRegistry.registerComponent('ChatApp', () => App)`
- [x] 15.7 In `ChatApp/src/App.tsx` (or the root app mount where auth finishes): inside a `useEffect` that depends on `isAuthenticated`: if authenticated, call `consumePendingIncomingCall()`; on non-null result, `navigationRef.navigate('IncomingCallModal', {sessionId, callType, remoteUser: {id: callerId, displayName: callerName, avatar: callerAvatar}})`
- [x] 15.8 In the same mount effect, call `registerFcmCallForegroundHandler((params) => navigationRef.navigate('IncomingCallModal', params))`; store the returned unsubscribe if the SDK provides one and cleanup on unmount
- [x] 15.9 Verify `@react-native-async-storage/async-storage` exists in `ChatApp/package.json` dependencies — if missing, add it and `npm install` ← (verify: background push writes AsyncStorage; foreground push navigates directly; replay on mount triggers IncomingCallModal; 46+ seconds old payload is discarded)

## 16. Mobile — navigation/types.ts Sanity Check

- [x] 16.1 Confirm `IncomingCallModal` params match `{sessionId: string, callType: 'audio'|'video', remoteUser: {id: string, displayName: string, avatar?: string}, iceServers?: {urls:string, username?:string, credential?:string}[]}` (existing types — verify unchanged)
- [x] 16.2 Confirm `CallModal` params accept optional `remoteUser` with the same shape (existing — verify)
- [x] 16.3 Run `npx tsc --noEmit` inside `ChatApp/` to confirm no type errors from 9.2, 14.x, 15.7, 15.8 changes

## 17. Integration Smoke Tests (manual — requires 2 devices)

- [ ] 17.1 Happy flow: device A calls device B → A hears ringback, B shows full-screen IncomingCallScreen with ringtone, B accepts → both go active, audio flows both ways, GET /call-logs shows status='ended' with correct duration after hangup
- [ ] 17.2 Cancel flow: A calls B, A cancels before B answers → B's IncomingCallScreen dismisses via `call_cancelled`, GET /call-logs shows status='cancelled'
- [ ] 17.3 Timeout flow: A calls B, B does not answer → after 30s A sees "call missed", B sees `call_timeout` dismiss, GET /call-logs shows status='missed'
- [ ] 17.4 Busy flow: A calls B while B is on another call → A immediately receives `call_busy`, no IncomingCallScreen on B, no new row in call-logs
- [ ] 17.5 Multi-device: B has two logged-in devices → A calls B, both devices show IncomingCallScreen → B accepts on device 1 → device 2 dismisses via `call_cancelled`
- [ ] 17.6 Offline push: B closes app → A calls B → Android FCM push delivered → B opens app within 45s → IncomingCallScreen appears with correct caller info ← (verify: all six flows produce expected state transitions, audio routing, UI updates, and call-logs rows)

## 18. Final Checks

- [ ] 18.1 Run `npm run lint` in `chat-backend/` — zero new errors
- [x] 18.2 Run `npm run test` in `chat-backend/` — all tests pass including new `webrtc.gateway.call-log.spec.ts` and updated `turn.service.spec.ts`
- [x] 18.3 Run `npx tsc --noEmit` in `ChatApp/` — zero type errors
- [ ] 18.4 Build Android debug APK: `cd ChatApp/android && ./gradlew assembleDebug` — build succeeds
- [ ] 18.5 Verify `gitnexus_detect_changes()` shows only expected symbols (webrtc.gateway handlers, TurnService, WebRTCService methods, useIncomingCall, fcmCallHandler exports, CallSessionCronService) were touched
