## Why

The WebRTC voice/video call skeleton is in place but is missing critical production behaviors: calls never time out, callers cannot cancel, there is no busy detection, incoming calls use a disruptive Alert dialog instead of a proper full-screen UI, audio routing is unmanaged, and call history is never persisted. These gaps make the calling feature unreliable and unusable at production quality.

## What Changes

- Add server-side call timeout (30s) with missed-call emission and handle cleanup
- Add `call_cancel` signaling event so a caller can retract a call before it is answered
- Add `call_busy` detection when the callee is already in an active session
- Add `call_ringing` acknowledgement so the caller knows the callee's device is alerting
- Add multi-device cancel: when one device accepts, dismiss all other devices of the same user
- Add double-call detection in both directions (A→B and B→A)
- Add `call-logs` MongoDB module (schema, service, controller) for persistent call history
- Replace `Alert.alert` incoming call with a full-screen `IncomingCallScreen` modal
- Integrate `react-native-incall-manager` for ringtone, ringback, vibration, and audio routing
- Add ICE restart logic (up to 2 retries) on connection failure
- Add adaptive video quality control based on `getStats()` packet-loss metrics
- Add `switchCamera()` to webrtcService and expose it through the hook
- Add `cancelCall()` to webrtcService for pre-answer cancellation
- Enforce a strict call state machine: idle → initiating → ringing → connecting → active → ended / failed
- Add a Calls tab screen (`CallsScreen`) that fetches and displays call history
- Move CallScreen to `src/screens/call/` and add `IncomingCallScreen` alongside it
- Extract audio management into `src/services/audio/callAudioService.ts`

## Capabilities

### New Capabilities

- `call-signaling-lifecycle`: Complete signaling event set (timeout, cancel, busy, ringing, multi-device cancel, double-call detection) and state machine enforcement
- `call-logs`: Persistent MongoDB call log records with REST history endpoint
- `incoming-call-ui`: Full-screen incoming call modal with ringtone, vibration, and auto-dismiss
- `call-audio-management`: Audio mode routing, ringtone/ringback playback, proximity sensor handling via react-native-incall-manager
- `call-resilience`: ICE restart on failure and adaptive video quality degradation/recovery
- `calls-history-screen`: Calls tab UI displaying paginated call log with callback action

### Modified Capabilities

- None

## Impact

**Backend**
- `chat-backend/src/webrtc/webrtc.gateway.ts` — new event handlers, timeout Map, busy check, multi-device cancel, gateway log writes
- New module: `chat-backend/src/call-logs/` (schema, service, controller, module, DTO)
- `chat-backend/src/webrtc/webrtc.module.ts` — import CallLogsModule

**Frontend**
- `ChatApp/src/services/webrtc/webrtcService.ts` — cancelCall(), switchCamera(), ICE restart, adaptive quality, state machine
- `ChatApp/src/hooks/useWebRTC.ts` — expose cancelCall, switchCamera, new states
- `ChatApp/src/hooks/useIncomingCall.ts` — navigate to IncomingCallScreen instead of Alert
- New: `ChatApp/src/screens/call/IncomingCallScreen.tsx`
- New: `ChatApp/src/screens/call/CallScreen.tsx` (moved from main/)
- New: `ChatApp/src/services/audio/callAudioService.ts`
- New: `ChatApp/src/screens/main/CallsScreen.tsx`
- `ChatApp/src/navigation/RootNavigator.tsx` — register IncomingCallModal
- `ChatApp/src/navigation/types.ts` — add IncomingCallModal params, update CallModal params

**Dependencies**
- Add `react-native-incall-manager` to `ChatApp/package.json`
