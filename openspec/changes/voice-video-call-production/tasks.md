## 1. Dependencies and Setup

- [x] 1.1 Add `react-native-incall-manager` to `ChatApp/package.json` and run `npm install` in ChatApp
- [x] 1.2 Verify `react-native-incall-manager` links correctly (check `ChatApp/android/app/build.gradle` for auto-link; rebuild if needed)
- [x] 1.3 Update `ChatApp/src/navigation/types.ts`: add `IncomingCallModal` to RootStackParamList with params `{ sessionId, callType, remoteUser: { id, displayName, avatar } }`; update `CallModal` params to include `remoteUser`

## 2. Backend — Call Logs Module

- [x] 2.1 Create `chat-backend/src/call-logs/call-log.schema.ts` with Mongoose schema (fields: sessionId, initiatorId, targetUserId, conversationId, callType, status, startedAt, answeredAt, endedAt, duration); add indexes on sessionId (unique), initiatorId, targetUserId, startedAt desc
- [x] 2.2 Create `chat-backend/src/call-logs/dto/query-call-logs.dto.ts` with validated `page` (default 1) and `limit` (default 20, max 50) query params
- [x] 2.3 Create `chat-backend/src/call-logs/call-logs.service.ts` with methods: `createLog(data)`, `updateLog(sessionId, update)`, `getCallHistory(userId, page, limit)` — getCallHistory filters where initiatorId OR targetUserId equals userId, sorted by startedAt desc
- [x] 2.4 Create `chat-backend/src/call-logs/call-logs.controller.ts` with `GET /call-logs` route (JWT-protected, uses JwtAuthGuard), calls `getCallHistory` with authenticated user id
- [x] 2.5 Create `chat-backend/src/call-logs/call-logs.module.ts`, register CallLogSchema, export CallLogsService
- [x] 2.6 Import `CallLogsModule` into `chat-backend/src/webrtc/webrtc.module.ts` ← (verify: module compiles, GET /call-logs returns 200 with valid JWT and 401 without)

## 3. Backend — Gateway Signaling Enhancements

- [x] 3.1 Add a `private callTimeouts = new Map<string, NodeJS.Timeout>()` to `webrtc.gateway.ts` for storing timeout handles
- [x] 3.2 In `handleCallInitiate`: inject `CallLogsService`; call `callLogsService.createLog(...)` after session is created successfully; store the created log id for later updates
- [x] 3.3 In `handleCallInitiate`: add bidirectional busy check — call `hasExistingSession(targetUserId, callerId, conversationId)` in addition to existing check; emit 'call_busy' and update log to 'busy' if either check hits
- [x] 3.4 In `handleCallInitiate`: add callee busy check via `getActiveSessionIds(targetUserId)` — if callee has active sessions, emit 'call_busy' to caller, update log to 'busy', and return without creating session
- [x] 3.5 In `handleCallInitiate`: fetch target user displayName and avatar from UsersService; include as `remoteUser` in both 'call_initiated' (to caller) and 'incoming_call' (to callee) payloads
- [x] 3.6 In `handleCallInitiate`: after emitting 'incoming_call', start a 30-second timeout via `setTimeout`; store handle in `callTimeouts`; on fire — if session still 'initiated', mark session 'missed', update log to 'missed', emit 'call_missed' to initiator socket, emit 'call_timeout' to target socket, and clear handle
- [x] 3.7 Add `@SubscribeMessage('call_ringing')` handler: validate session exists; relay 'call_ringing' event to initiator socket; ignore if session not found
- [x] 3.8 Add `@SubscribeMessage('call_cancel')` handler: validate caller is initiator and session is 'initiated'; mark session 'ended'; update log to 'cancelled' (use 'missed' or add 'cancelled' to status enum); emit 'call_cancelled' to callee socket; clear timeout handle from `callTimeouts`
- [x] 3.9 In `handleCallAccept`: after accept logic, emit 'call_cancelled' to all other sockets in `user:<userId>` room except the accepting socket (`io.in('user:${userId}').except(client.id).emit('call_cancelled', ...)`); update log answeredAt
- [x] 3.10 In all terminal event handlers (decline, end, timeout): call `callLogsService.updateLog(sessionId, { status, endedAt, duration })` with correct values; clear timeout handle from `callTimeouts` if present ← (verify: all terminal paths update the call log; a complete call shows correct duration; a missed call shows duration 0)

## 4. Backend — Verify User Room Membership

- [x] 4.1 In `webrtc.gateway.ts` `handleConnection`: confirm the gateway joins `user:<userId>` room on socket connect (required for multi-device cancel); add `client.join('user:${userId}')` if absent ← (verify: multi-device cancel logic works — second connected socket receives call_cancelled when first accepts)

## 5. Frontend — callAudioService

- [x] 5.1 Create `ChatApp/src/services/audio/callAudioService.ts` as a module-level singleton; import `InCallManager` from `react-native-incall-manager`
- [x] 5.2 Implement `startRingback()`: calls `InCallManager.startRingback('_BUNDLE_')` (or platform default)
- [x] 5.3 Implement `startRingtone()`: calls `InCallManager.startRingtone('_DEFAULT_')` + `Vibration.vibrate([0, 1000, 1000], true)`
- [x] 5.4 Implement `stop()`: calls `InCallManager.stop()` and `Vibration.cancel()`; wrap in try/catch so it is always safe to call
- [x] 5.5 Implement `setVoiceMode()`: calls `InCallManager.start({ media: 'audio' })` to route audio to earpiece
- [x] 5.6 Implement `setSpeaker(enabled: boolean)`: calls `InCallManager.setForceSpeakerphoneOn(enabled)` ← (verify: audio routes correctly to earpiece on call active; speakerphone toggle changes routing; stop() does not throw when called without prior start)

## 6. Frontend — WebRTC Service Enhancements

- [x] 6.1 Add call state type extension in `webrtcService.ts`: ensure CallState includes 'connecting' and 'failed' states
- [x] 6.2 Implement state machine transition guard in webrtcService: create a `VALID_TRANSITIONS` map and a `transition(newState)` helper that checks validity, logs invalid attempts, and only updates state if valid
- [x] 6.3 Add `cancelCall(sessionId: string)` method: guard that state is 'initiating' or 'ringing'; emit 'call_cancel'; stop local media tracks; close peer connection; call `transition('ended')`; call `callAudioService.stop()`
- [x] 6.4 Add `switchCamera()` method: check that `localStream` has a video track; call `videoTrack._switchCamera()`; no-op and log warning if no video track
- [x] 6.5 Add ICE restart logic: in the `iceconnectionstatechange` handler, when state is 'failed' and call state is 'active' and `iceRestartCount < 2`, increment count, call `createOffer({ iceRestart: true })`, set local description, emit offer via gateway
- [x] 6.6 When ICE restart count reaches 2 and fails again: call `transition('failed')`, emit 'call_failed' to server
- [x] 6.7 Add getStats polling: start a 5-second interval when call state transitions to 'active' and callType is 'video'; parse outbound-rtp stats for packetsLost and packetsSent; track consecutive high-loss poll count; clear interval on any terminal state
- [x] 6.8 On two consecutive high-loss polls (>5%): call `localVideoTrack.applyConstraints({ width: 320, height: 240 })`
- [x] 6.9 On two consecutive clean polls while degraded: call `localVideoTrack.applyConstraints({ width: 640, height: 480 })`
- [x] 6.10 Integrate callAudioService into webrtcService state transitions: call `startRingback()` on 'ringing', `setVoiceMode()` on 'active', `stop()` on 'ended' and 'failed' ← (verify: state machine rejects invalid transitions; ICE restart fires on failure; ICE restart capped at 2 attempts; adaptive quality changes constraints on third consecutive high-loss poll)

## 7. Frontend — useWebRTC Hook Updates

- [x] 7.1 Expose `cancelCall` and `switchCamera` from `useWebRTC` hook return value
- [x] 7.2 Expose 'connecting' and 'failed' call states in hook return value (type-check passes)

## 8. Frontend — IncomingCallScreen

- [x] 8.1 Create `ChatApp/src/screens/call/IncomingCallScreen.tsx`: accept navigation params (sessionId, callType, remoteUser)
- [x] 8.2 Render full-screen layout with: remote user avatar (UserAvatar component), remote user displayName, call type label ('Audio Call' or 'Video Call')
- [x] 8.3 Render Accept button (green) and Decline button (red) with appropriate icons
- [x] 8.4 On mount: call `callAudioService.startRingtone()`; emit 'call_ringing' via webrtcService with sessionId
- [x] 8.5 Accept handler: call `callAudioService.stop()`; call `webrtcService.acceptCall(sessionId)`; navigate to CallModal with full params (sessionId, callType, remoteUser); dismiss this screen
- [x] 8.6 Decline handler: call `callAudioService.stop()`; call `webrtcService.declineCall(sessionId)`; navigate back / dismiss screen
- [x] 8.7 Listen for 'call_cancelled' socket event: call `callAudioService.stop()` and dismiss screen
- [x] 8.8 Listen for 'call_timeout' socket event: call `callAudioService.stop()` and dismiss screen
- [x] 8.9 On unmount (useEffect cleanup): remove 'call_cancelled' and 'call_timeout' listeners; call `callAudioService.stop()` as safety net ← (verify: ringtone starts on mount; auto-dismiss fires on call_cancelled and call_timeout; accepting navigates to CallScreen with correct params)

## 9. Frontend — Enhanced CallScreen

- [x] 9.1 Move `ChatApp/src/screens/main/CallScreen.tsx` to `ChatApp/src/screens/call/CallScreen.tsx`; update all import paths that reference the old location
- [x] 9.2 Add remote user display: read `remoteUser` from navigation params, render avatar (UserAvatar) and displayName in the header area
- [x] 9.3 Add connection status label: render 'Connecting...' when state is 'connecting', 'Call Failed' when state is 'failed'
- [x] 9.4 Add switch camera button (visible only for video calls): calls `webrtcService.switchCamera()`
- [x] 9.5 Add speaker toggle button: calls `callAudioService.setSpeaker(toggled)`, button reflects current speaker state with local boolean state
- [x] 9.6 Add 'failed' state retry affordance: a Retry button that calls `webrtcService.retryCall()` or shows an alert prompting the user to redial (prefer a simple retry UX matching what the service supports)
- [x] 9.7 Update end call handler: if call state is 'initiating' or 'ringing', call `webrtcService.cancelCall(sessionId)` instead of `webrtcService.endCall(sessionId)` ← (verify: remoteUser info renders; switch camera works during video call; speaker toggle routes audio; failed state renders retry)

## 10. Frontend — useIncomingCall Hook Update

- [x] 10.1 In `useIncomingCall.ts`: replace `Alert.alert` with `navigation.navigate('IncomingCallModal', { sessionId, callType, remoteUser })` on 'incoming_call' event
- [x] 10.2 Remove any direct callAudioService or alert references from useIncomingCall (audio is now managed inside IncomingCallScreen)

## 11. Frontend — Navigation Registration

- [x] 11.1 In `RootNavigator.tsx`: add `<Stack.Screen name="IncomingCallModal" component={IncomingCallScreen} options={{ presentation: 'fullScreenModal', headerShown: false }} />`
- [x] 11.2 Update `CallModal` Stack.Screen options if headerShown or presentation needs updating for remoteUser params
- [x] 11.3 Verify TypeScript compiles with updated RootStackParamList (no type errors on navigate calls) ← (verify: IncomingCallScreen renders full-screen over any active screen; back gesture does not dismiss the modal unintentionally)

## 12. Frontend — Calls History Screen

- [x] 12.1 Create `ChatApp/src/screens/main/CallsScreen.tsx`: fetch GET /call-logs?page=1&limit=20 via apiService on mount
- [x] 12.2 Render FlatList with call log entries: each entry shows remote party name/avatar, call type icon, status badge, formatted duration (mm:ss), relative timestamp
- [x] 12.3 Implement onEndReached pagination: fetch next page and append to list; track whether more pages exist; show ActivityIndicator footer during load
- [x] 12.4 Render empty state when no call records exist
- [x] 12.5 Entry tap handler: initiate a new call of the same type to the remote party using existing webrtcService.initiateCall(); handle unavailable user with an alert
- [x] 12.6 Register CallsScreen in the appropriate tab navigator (ChatTabStack or PersonalTabStack per existing tab structure) ← (verify: list loads and paginates; missed calls show red indicator; ended calls show duration; tapping an entry initiates a call)

## 13. Integration Smoke Test

- [ ] 13.1 End-to-end: initiate a call from device A to device B — verify ringing state on A (ringback plays), IncomingCallScreen on B (ringtone plays), accept on B (both screens show 'connecting' then 'active', audio routes)
- [ ] 13.2 Cancel flow: initiate call from A, cancel before B answers — verify 'call_cancelled' received on B, IncomingCallScreen dismisses, log status is 'cancelled'/'missed'
- [ ] 13.3 Timeout flow: initiate call, do not answer — verify after 30s server emits 'call_missed' to A and 'call_timeout' to B, log status is 'missed'
- [ ] 13.4 Busy flow: call a user who is already in a call — verify 'call_busy' received on caller, no IncomingCallScreen on busy user
- [ ] 13.5 Call log: complete a call, then verify GET /call-logs returns correct status, answeredAt, endedAt, and duration ← (verify: all five flows produce the correct log status; audio behaves correctly on each state transition)
