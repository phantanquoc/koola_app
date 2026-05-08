## Why

Hiện tại khi caller gọi mà callee không có socket `/webrtc` đang kết nối, gateway kết thúc phiên ngay lập tức và đánh dấu `missed` — callee hoàn toàn không nhận được thông báo nào (không banner lock screen, không tray notification, không có cơ hội bắt máy). Đây là lỗ hổng UX nghiêm trọng nhất của hệ thống call và là blocker P0 trước khi ship production. Change này xử lý phần backend để gửi FCM push + giữ session sống trong một cửa sổ grace period để callee có cơ hội wake up và chấp nhận cuộc gọi.

## What Changes

- Add `CallNotificationsService` under `chat-backend/src/webrtc/services/` responsible for sending FCM data-only messages shaped for incoming call wake-up flows.
- Modify `handleCallInitiate` in `webrtc.gateway.ts` to branch on callee's `/webrtc` socket presence:
  - **Online** → existing flow (emit `incoming_call` to callee socket, start existing 30s timeout).
  - **Offline with FCM tokens** → send FCM data push to all tokens, start a **25-second grace period timer**, emit `call_initiated` to caller as if ringing normally, keep Redis session in state `initiated` with a new `pushSentAt` field.
  - **Offline with no FCM tokens** → existing immediate-missed flow (emit `call_missed` with reason `User unreachable`).
- FCM payload uses **data-only** messages (not notification messages) so the mobile app handler can wake up and trigger CallKit / ConnectionService / foreground service when mobile native integration ships in a later change.
- Add `pushSentAt?: Date` to `CallSession` in Redis for debugging / observability.
- Ensure grace-period timer is cleared on all terminal events: `call_accept`, `call_decline`, `call_cancel`, `call_end`, callee disconnect during grace.
- Verify `CallSessionCronService` continues to pick up stale `initiated` sessions (both online-ringing and offline-push variants) — no code change expected, only verification in tasks.

## Capabilities

### New Capabilities
- `webrtc-offline-call-push`: Backend FCM push delivery and grace-period session handling when call target is not currently connected to the `/webrtc` namespace.

### Modified Capabilities
_None._ The existing spec for call signaling lifecycle lives inside the in-progress `voice-video-call-production` change, not in `openspec/specs/` yet. New behavior is additive and scoped under a dedicated new capability to avoid coupling with that change.

## Impact

**Code affected**:
- `chat-backend/src/webrtc/webrtc.gateway.ts` — `handleCallInitiate` offline branch, reuse of `callTimeouts` Map for grace timers.
- `chat-backend/src/webrtc/services/call-notifications.service.ts` — **NEW**.
- `chat-backend/src/webrtc/services/call-session.service.ts` — extend `CallSession` type with optional `pushSentAt` field.
- `chat-backend/src/webrtc/webrtc.module.ts` — register new service, import `UsersModule` (or inject already-available `UsersService`) and Firebase messaging module equivalent to what `NotificationsService` currently uses.

**APIs / protocols**:
- No new REST endpoint.
- No new WebSocket event shape. Caller still sees `call_initiated` + eventually `call_missed`/`call_accepted`/`call_cancelled` exactly as before.
- New FCM message shape: data-only payload with `type='incoming_call'` + session context (see design.md).

**Dependencies**:
- Uses existing `firebase-admin` messaging client via `notifications/fcm-client.ts`.
- Uses existing `users.fcmTokens[]` on `User` schema — no schema change.

**Not in scope (deferred)**:
- Mobile FCM background handler for `type=incoming_call`.
- iOS VoIP push / PushKit / APNs VoIP cert setup.
- Mobile CallKit / Android ConnectionService integration.
- `voipToken` field on User schema (iOS-only; needed later for VoIP cert).
- Foreground service + full-screen intent for Android call UI.
- Quiet-hours / notification settings for calls.

**Risk**:
- In-memory `callTimeouts` Map is lost on server restart, but existing `CallSessionCronService` reconciles stale `initiated` sessions every 15s — any orphaned offline-push session will be cleaned up by the cron as `missed` within ~75s. Acceptable for this slice.
