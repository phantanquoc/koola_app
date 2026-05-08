# Phân tích Flow Call Audio/Video — APP_KOOLA

> **Phạm vi**: Toàn bộ luồng cuộc gọi 1-1 (audio + video) và group call, từ khởi tạo → signaling → media → kết thúc, cả mobile (React Native) và backend (NestJS).
>
> **Ngày phân tích**: 2026-05-08
> **Nguồn**: Đọc trực tiếp source code ở `chat-backend/src/webrtc/`, `chat-backend/src/call-logs/`, `ChatApp/src/services/webrtc/`, `ChatApp/src/hooks/`, `ChatApp/src/screens/call/`.

---

## 1. Kiến trúc tổng quan

```
Mobile (React Native)                    Backend (NestJS)
─────────────────────                    ────────────────
webrtcService.ts (singleton)  ←──WS──→  WebrtcGateway
  └─ socket.io namespace /webrtc           namespace: /webrtc
useWebRTC.ts (hook)                       CallSessionService (Redis)
useIncomingCall.ts (hook)                 CallSessionCronService (cron 1 phút)
CallScreen.tsx                            TurnService (HMAC-SHA1)
IncomingCallScreen.tsx                    CallLogsService (MongoDB)
CallsScreen.tsx                           NotificationsService (FCM — chat-only)
```

**Cảnh báo nhầm lẫn code**: Có **hai file `CallScreen.tsx`** tồn tại song song:

| File | Trạng thái |
|---|---|
| `ChatApp/src/screens/main/CallScreen.tsx` | Dead code — không được dùng |
| `ChatApp/src/screens/call/CallScreen.tsx` | **Đang dùng** (RootNavigator) |

`RootNavigator.tsx:8` import từ `screens/call/CallScreen`. `CallNavigator.tsx` import bản `screens/main/` nhưng bản thân `CallNavigator` không được đăng ký ở bất kỳ đâu trong navigation tree.

---

## 2. Socket namespace và authentication

- **Namespace**: `/webrtc` (tách biệt hoàn toàn với chat namespace `/`)
- **URL**: `${ENV.WS_URL}/webrtc`
- **Transport**: WebSocket only (`transports: ['websocket']`)
- **Auth**: JWT token truyền qua `query: { token }` khi connect
- **Verify**: `handleConnection` (`webrtc.gateway.ts:55-78`) — decode JWT, gán `client.data.user`, sau đó `client.join('user:{userId}')` để hỗ trợ multi-device

**Nhược điểm**: Auth chỉ xảy ra một lần khi connect. Mọi event sau đó tin tưởng `client.data.user` — không có re-auth khi token expire trong cuộc gọi dài.

---

## 3. Danh sách socket events đầy đủ

### 3.1 Client → Server (emit từ Mobile)

| Event | Payload | Mục đích |
|---|---|---|
| `call_initiate` | `{ targetUserId, conversationId, callType }` | Khởi tạo cuộc gọi 1-1 |
| `call_ringing` | `{ sessionId }` | Callee báo đang đổ chuông |
| `call_cancel` | `{ sessionId }` | Caller hủy trước khi được nhận |
| `call_accept` | `{ sessionId }` | Callee chấp nhận |
| `call_decline` | `{ sessionId }` | Callee từ chối |
| `call_end` | `{ sessionId }` | Kết thúc cuộc gọi đang active |
| `call_join` | `{ sessionId }` | Tham gia group call |
| `call_offer` | `{ sessionId, sdp }` | SDP offer |
| `call_answer` | `{ sessionId, sdp }` | SDP answer |
| `call_ice_candidate` | `{ sessionId, candidate }` | ICE candidate |

### 3.2 Server → Client (emit từ Backend)

| Event | Payload | Target |
|---|---|---|
| `incoming_call` | `{ sessionId, fromUserId, fromUser, remoteUser, callType, conversationId, iceServers }` | Callee |
| `call_initiated` | `{ sessionId, iceServers, targetUserId, callType, remoteUser }` | Caller |
| `call_ringing` | `{ sessionId }` | Caller |
| `call_accepted` | `{ sessionId }` | Caller |
| `call_declined` | `{ sessionId, reason }` | Caller |
| `call_cancelled` | `{ sessionId, reason? }` | Callee / các device khác của callee |
| `call_ended` | `{ sessionId }` | Cả hai |
| `call_missed` | `{ sessionId, reason }` | Caller |
| `call_timeout` | `{ sessionId }` | Callee |
| `call_busy` | `{ sessionId, reason }` | Caller |
| `call_offer` | `{ sessionId, fromUserId, sdp }` | Peer |
| `call_answer` | `{ sessionId, fromUserId, sdp }` | Peer |
| `call_ice_candidate` | `{ sessionId, fromUserId, candidate }` | Peer(s) |
| `participant_joined` | `{ sessionId, user }` | Group participants |
| `call_joined` | `{ sessionId, participants, iceServers }` | Người vừa join |
| `error` | `{ code, message }` | Client gây lỗi |

### 3.3 REST endpoints

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| `GET` | `/call-logs?page&limit` | JWT | Lịch sử cuộc gọi, phân trang |

Response:
```json
{ "items": [...], "total": 100, "page": 1, "limit": 20 }
```

Không có REST endpoint nào khác cho call — **toàn bộ signaling đi qua WebSocket**.

---

## 4. Sequence diagrams

### 4.1 Outgoing call (Caller khởi tạo)

```
Caller Mobile          Backend (Gateway)         Callee Mobile
─────────────          ─────────────────         ─────────────
[ChatScreen / CallsScreen]
  │ handleStartCall()
  │ webrtcService.initiateCall()
  │ state: idle → initiating
  │──── call_initiate ──────────────────────────────────────────→│
  │                    │ validate membership (conversation)
  │                    │ busy check caller (active_calls:{callerId})
  │                    │ busy check callee
  │                    │ fetchSockets(user:{targetId}) — check online
  │                    │ createSession() → Redis
  │                    │ callLogsService.createLog(status:'missed')
  │                    │ turnService.getIceServers()
  │                    │──── incoming_call ──────────────────────→│
  │←── call_initiated ─│                                          │
  │ state: initiating → ringing                                   │
  │ callAudioService.startRingback()                              │
  │                    │ setTimeout(30s) → callTimeouts Map       │
  │                    │                                          │ [useIncomingCall]
  │                    │                                          │ navigate('IncomingCallModal')
  │                    │                                          │ callAudioService.startRingtone()
  │                    │                                          │ webrtcService.emitRinging()
  │                    │←── call_ringing ─────────────────────────│
  │                    │──── call_ringing ────────────────────────→│ (relay)
  │←── call_ringing ───│
```

### 4.2 Accept call

```
Caller Mobile          Backend (Gateway)         Callee Mobile
─────────────          ─────────────────         ─────────────
                                                  │ handleAccept()
                                                  │ callAudioService.stop()
                                                  │ webrtcService.acceptCall(sessionId)
                                                  │ state: ringing → connecting
                                                  │──── call_accept ──────────────────→│
                                                  │ clearCallTimeout()
                                                  │ updateSessionState('active')
                                                  │ addParticipant(calleeId)
                                                  │ callLogsService.updateLog(
                                                  │   answeredAt, status:'answered')
                                                  │ emit call_cancelled đến các device
                                                  │ khác của callee (multi-device dismiss)
  │←── call_accepted ──│
  │ state: ringing → connecting
  │ callAudioService.stopRingback()
  │
  │ [useWebRTC: setupCall()]
  │ getLocalStream()
  │ createPeerConnection(sessionId, iceServers)
  │ createAndSendOffer()
  │──── call_offer (sdp) ──────────────────────────────────────→│
  │                    │ validateParticipant()
  │                    │──── call_offer ──────────────────────────→│
  │                    │                                          │ [useWebRTC.setupCall]
  │                    │                                          │ getLocalStream()
  │                    │                                          │ createPeerConnection()
  │                    │                                          │ handleRemoteOffer()
  │                    │                                          │ createAnswer()
  │                    │←── call_answer (sdp) ────────────────────│
  │                    │ updateSessionState('active') nếu cần
  │←── call_answer ────│
  │ handleRemoteAnswer()
  │ setRemoteDescription()
  │
  │──── call_ice_candidate ────────────────────────────────────→│
  │                    │──── call_ice_candidate ──────────────────→│
  │←── call_ice_candidate ─────────────────────────────────────│
  │ (ICE exchange song song)
  │
  │ connectionState: 'connected'
  │ state: connecting → active
  │ callAudioService.setVoiceMode()
  │ callAudioService.setKeepScreenOn(true)
  │ [video] startStatsPolling()
  │                                                              │ connectionState: 'connected'
  │                                                              │ state: connecting → active
```

### 4.3 Decline

```
Caller Mobile          Backend (Gateway)         Callee Mobile
─────────────          ─────────────────         ─────────────
                                                  │ handleDecline()
                                                  │ webrtcService.declineCall(sessionId)
                                                  │──── call_decline ─────────────────→│
                                                  │ clearCallTimeout()
                                                  │ endSession()
                                                  │ callLogsService.updateLog(status:'declined')
  │←── call_declined ──│
  │ state: → ended
  │ navigation.goBack()
```

### 4.4 Hangup (call đã active)

```
Caller/Callee Mobile   Backend (Gateway)         Other Participant
────────────────────   ─────────────────         ─────────────────
│ handleEndOrCancel()
│ webrtcService.endCall(sessionId)
│ state: → ended
│ cleanup() [tracks, peerConnection]
│──── call_end ──────────────────────────────────────────────────→│
│                    │ validateParticipant()
│                    │ clearCallTimeout()
│                    │ endSession()
│                    │ fetch log → compute duration (now - answeredAt)
│                    │ callLogsService.updateLog(
│                    │   status:'ended', duration)
│                    │──── call_ended ──────────────────────────────→│
│←── call_ended ─────│
│ callAudioService.stop()
│ setKeepScreenOn(false)
│ navigation.goBack() (sau 1.5s)
```

### 4.5 Cancel (Caller hủy trước khi nhận)

```
Caller Mobile          Backend (Gateway)         Callee Mobile
─────────────          ─────────────────         ─────────────
│ cancelCall()
│ webrtcService.cancelCall(sessionId)
│ state: initiating/ringing → ended
│──── call_cancel ───────────────────────────────────────────────→│
│                    │ validate initiatorId === callerId
│                    │ validate state === 'initiated'
│                    │ endSession()
│                    │ callLogsService.updateLog(status:'cancelled')
│                    │ clearCallTimeout()
│                    │──── call_cancelled ──────────────────────────→│
│                    │                                              │ callAudioService.stop()
│                    │                                              │ navigation.goBack()
```

### 4.6 Timeout (30 giây không ai nhận)

```
Caller Mobile          Backend (Gateway)         Callee Mobile
─────────────          ─────────────────         ─────────────
                       │ [setTimeout 30s fires]
                       │ getSession() → state === 'initiated'
                       │ endSession()
                       │ callLogsService.updateLog(status:'missed')
  │←── call_missed ───│ (reason: 'No answer')
  │ state: → ended                                │←── call_timeout ─│
  │ navigation.goBack()                           │ navigation.goBack()
```

---

## 5. State machines

### 5.1 Mobile — `webrtcService.ts:40` VALID_TRANSITIONS

```
idle ──────────────────────────────────────────────────────────────
  │ initiateCall()                    │ incoming_call received
  ↓                                   ↓
initiating                          ringing
  │ call_ringing received             │ acceptCall() / call_accepted received
  ↓                                   ↓
ringing                             connecting
  │ call_accepted received            │ connectionState === 'connected'
  ↓                                   ↓
connecting ────────────────────── active
  │ connectionState === 'connected'   │ endCall() / call_ended / peer_disconnected
  ↓                                   ↓
active ─────────────────────────── ended
  │ ICE failed (max retries)
  ↓
failed ──→ ended
```

### 5.2 Backend — CallState (Redis)

`call-session.service.ts:6`:
```typescript
export type CallState = 'initiated' | 'active' | 'ended' | 'missed' | 'declined';
```

```
initiated → active → ended
initiated → missed (timeout / callee offline)
initiated → declined (callee từ chối)
initiated → ended (caller cancel / disconnect)
```

### 5.3 MongoDB — CallLogStatus

`call-log.schema.ts:7-13`:
```
missed (default khi tạo)
→ answered (khi callee accept)
→ ended (khi call_end)
→ declined (khi callee decline)
→ cancelled (khi caller cancel)
→ busy (khi callee đang bận)
→ failed (định nghĩa trong schema, chưa được gateway set)
```

---

## 6. Redis data model

| Key | Type | TTL | Nội dung |
|---|---|---|---|
| `call:{sessionId}` | Hash | 3600s | CallSession object (initiator, target, callType, state, …) |
| `call_participants:{sessionId}` | Set | 3600s | Set userId tham gia |
| `call_timeout:{sessionId}` | String | 60s | Marker `'pending'` |
| `active_calls:{userId}` | Set | 3600s | Set sessionId mà user đang tham gia |
| `initiated_sessions` | Sorted Set | — | sessionId → timestamp (cron cleanup) |

---

## 7. TurnService — TURN credentials

File: `chat-backend/src/webrtc/services/turn.service.ts:24`.

Dùng **HMAC-SHA1 time-limited credentials** (coturn REST API format):
- `username = "{timestamp+3600}:{userId}"`
- `password = HMAC-SHA1(TURN_STATIC_SECRET, username)` → base64

ICE servers trả về 4 entries:
1. `stun:stun.l.google.com:19302` (Google STUN — dự phòng)
2. `stun:{COTURN_IP}:{COTURN_PORT}` (self-hosted STUN)
3. `turn:{COTURN_IP}:{COTURN_PORT}?transport=tcp`
4. `turn:{COTURN_IP}:{COTURN_PORT}` (UDP)

Credentials gửi kèm trong `incoming_call` và `call_initiated`, có hiệu lực 1 giờ.

---

## 8. CallSessionCronService — safety net

File: `chat-backend/src/webrtc/services/call-session-cron.service.ts:17`.

Chạy **mỗi phút** (`@Cron('* * * * *')`). Mục đích: cleanup recovery khi server crash làm mất in-memory setTimeout.

Logic:
1. `callSessionService.cleanupStaleSessions()` — quét `initiated_sessions` sorted set, lấy các session có `timestamp < now - 60s`
2. Với mỗi stale session:
   - Update log `status: 'missed'`
   - Emit `call_missed` cho initiator
   - Emit `call_timeout` cho callee (nếu còn online)
   - Xóa khỏi Redis

**Độ trễ tối đa**: ~2 phút (1 phút cron + 60s grace period).

---

## 9. Tính năng nâng cao

### 9.1 Adaptive video quality (`webrtcService.ts:521`)

Chỉ áp dụng video call khi state = `active`. Polling `getStats()` mỗi 5 giây:

| Điều kiện | Hành động |
|---|---|
| packet loss > 5% trong 2 lần liên tiếp | Degrade xuống 320x240 |
| packet loss < 5% trong 2 lần liên tiếp sau khi đã degrade | Restore 640x480 |

### 9.2 ICE restart (`webrtcService.ts:416`)

Khi `iceConnectionState === 'failed'` và call đang `active`:
- Tối đa 2 lần restart (`MAX_ICE_RESTARTS = 2`)
- Tạo offer với `{ iceRestart: true }`, emit `call_offer` lại
- Nếu hết retry: transition `failed`, emit `call_failed` **(nhưng backend không có handler cho event này)**

### 9.3 Multi-device support

- Mỗi user join room `user:{userId}` khi connect
- Khi callee accept trên một device: `call_cancelled` emit tới tất cả devices khác của cùng user (`webrtc.gateway.ts:563`)
- Khi disconnect: `remaining = await this.io.in(userRoom).fetchSockets()` — chỉ end session nếu không còn socket nào khác

### 9.4 Audio / UI side effects

- Khi ringing: `callAudioService.startRingback()` (caller) / `startRingtone()` (callee)
- Khi connected: `callAudioService.setVoiceMode()`, `setKeepScreenOn(true)`
- Khi ended: stop all + `setKeepScreenOn(false)`

---

## 10. Điểm yếu / Risk

### 🔴 Risk 1 — Thiếu FCM push cho incoming call khi callee offline

**File**: `webrtc.gateway.ts:251-264`

```typescript
if (!targetOnline) {
  await this.callSessionService.endSession(session.sessionId);
  await this.callLogsService.updateLog(session.sessionId, { status: 'missed', ... });
  client.emit('call_missed', { sessionId, reason: 'User is offline' });
  return;
}
```

Callee offline → cuộc gọi missed ngay lập tức. **Không gửi FCM**. Người dùng không thấy notification "có cuộc gọi nhỡ" trên lock screen, không có khả năng nhận call khi app bị kill.

**Gợi ý fix**: Integrate NotificationsService để gửi FCM high-priority data message (hoặc CallKit trigger trên iOS / ConnectionService trên Android) trước khi end session, kèm theo grace period 20-30s để app wake up.

### 🔴 Risk 2 — `call_failed` event không có handler

**File mobile**: `webrtcService.ts:439`
```typescript
this.socket?.emit('call_failed', { sessionId: this.currentSessionId });
```

Backend không có `@SubscribeMessage('call_failed')`. Hệ quả:
- Session Redis không được cleanup (phải đợi TTL 3600s)
- Call log không được update
- Peer kia không biết call đã fail

**Gợi ý fix**: Thêm handler gọi `endSession` + update log `failed` + emit `call_ended` cho peer.

### 🟡 Risk 3 — `remoteUser` không được truyền vào CallModal từ ChatScreen

**File**: `ChatScreen.tsx:760-765`
```typescript
rootNav?.navigate('CallModal', {
  sessionId,
  callType,
  isInitiator: true,
  iceServers: servers,
  // remoteUser KHÔNG được truyền
});
```

`CallScreen.tsx` hiển thị `remoteUser.displayName` → bị undefined khi gọi từ chat (CallsScreen thì truyền đúng).

**Gợi ý fix**: Truyền `remoteUser: { id, displayName, avatarUrl }` từ `ChatScreen` (lấy từ conversation members).

### 🟡 Risk 4 — Dead code `CallScreen` ở `screens/main/`

**File**: `ChatApp/src/screens/main/CallScreen.tsx`

Gây nhầm lẫn khi maintain. `CallNavigator.tsx` import file này nhưng bản thân `CallNavigator` không ở đâu trong navigation tree.

**Gợi ý fix**: Xóa `screens/main/CallScreen.tsx` và `CallNavigator.tsx` sau khi kiểm tra chắc chắn không còn reference.

### 🟡 Risk 5 — In-memory setTimeout không survive server restart

**File**: `webrtc.gateway.ts:44`, `webrtc.gateway.ts:287-310`

`callTimeouts = new Map<string, NodeJS.Timeout>()` mất hết nếu restart.

**Đã có mitigation**: `CallSessionCronService` mỗi phút. Nhưng độ trễ tối đa ~2 phút — người dùng có thể bị "kẹt" ở màn hình ringing trong khoảng đó.

**Gợi ý fix**: Giảm cron interval xuống 15 giây (`*/15 * * * * *`), hoặc dùng Redis key TTL + keyspace notifications để trigger cleanup real-time.

### 🟡 Risk 6 — Không re-auth giữa cuộc gọi

**File**: `webrtc.gateway.ts:55`

JWT có thể expire trong cuộc gọi dài (> 15 phút). Hiện tại client vẫn gửi được event, backend vẫn accept dựa trên `client.data.user` đã lưu.

**Gợi ý fix**: Refresh token qua socket event riêng (`auth:refresh`), hoặc validate JWT TTL ở mỗi event handler critical.

### 🟡 Risk 7 — Không rate limiting trên `call_initiate`

Không giới hạn số lần gọi trong một khoảng thời gian → có thể spam call gây phiền nhiễu.

**Gợi ý fix**: Thêm Redis rate limiter (ví dụ: max 10 calls/phút mỗi user).

### 🟡 Risk 8 — Group call chưa hoàn thiện

**File**: `webrtc.gateway.ts:490`
```typescript
const targetId = session.initiatorId;
```

`call_answer` luôn relay về initiator → group call cần mesh topology nhưng logic hiện tại chỉ work cho 1-1. `call_accept` cũng chỉ cho phép `targetUserId` duy nhất.

**Gợi ý fix**: Tách thiết kế group call ra spec riêng, dùng SFU/MCU thay vì mesh nếu > 3 người.

### 🟡 Risk 9 — Race condition offer đến trước khi PC sẵn sàng

**File**: `webrtcService.ts:59-61`, `webrtcService.ts:485-489`

Đã có `pendingOffer` buffer, nhưng nếu `call_offer` đến trước `call_accepted`, state machine có thể chưa đúng vị trí — offer bị drop.

**Gợi ý fix**: Queue offer trong Redis phía backend để chỉ relay sau khi cả hai bên ready.

### 🟢 Risk 10 — Không có observability cho call quality

Không log packet loss, jitter, RTT, call duration distribution. Khi user complain "chất lượng kém", không có data để điều tra.

**Gợi ý fix**: Thêm endpoint `POST /call-logs/:id/stats` để mobile gửi metrics định kỳ, lưu dạng time-series.

---

## 11. File paths quan trọng

### Backend

| File:line | Mô tả |
|---|---|
| `chat-backend/src/webrtc/webrtc.gateway.ts:34` | `@WebSocketGateway({ namespace: '/webrtc' })` |
| `chat-backend/src/webrtc/webrtc.gateway.ts:32` | `CALL_TIMEOUT_MS = 30_000` |
| `chat-backend/src/webrtc/webrtc.gateway.ts:55` | `handleConnection` — JWT verify |
| `chat-backend/src/webrtc/webrtc.gateway.ts:126` | `call_initiate` entry point |
| `chat-backend/src/webrtc/webrtc.gateway.ts:251` | Xử lý callee offline (không FCM) |
| `chat-backend/src/webrtc/webrtc.gateway.ts:287` | In-memory setTimeout logic |
| `chat-backend/src/webrtc/webrtc.gateway.ts:490` | `call_answer` relay về initiator |
| `chat-backend/src/webrtc/webrtc.gateway.ts:524` | `call_accept` handler |
| `chat-backend/src/webrtc/webrtc.gateway.ts:563` | Multi-device dismiss |
| `chat-backend/src/webrtc/webrtc.gateway.ts:614` | `call_end` + duration calc |
| `chat-backend/src/webrtc/services/call-session.service.ts:6` | `CallState` type |
| `chat-backend/src/webrtc/services/call-session.service.ts:19-22` | TTL constants |
| `chat-backend/src/webrtc/services/call-session.service.ts:240` | `cleanupStaleSessions()` |
| `chat-backend/src/webrtc/services/call-session-cron.service.ts:17` | `@Cron('* * * * *')` |
| `chat-backend/src/webrtc/services/turn.service.ts:24` | `generateCredentials()` HMAC-SHA1 |
| `chat-backend/src/call-logs/call-log.schema.ts:7-13` | `CallLogStatus` enum |
| `chat-backend/src/call-logs/call-logs.controller.ts:11` | `GET /call-logs` |

### Mobile

| File:line | Mô tả |
|---|---|
| `ChatApp/src/services/webrtc/webrtcService.ts:40` | `VALID_TRANSITIONS` state machine |
| `ChatApp/src/services/webrtc/webrtcService.ts:81` | `connect(token)` — socket init |
| `ChatApp/src/services/webrtc/webrtcService.ts:250` | `initiateCall()` |
| `ChatApp/src/services/webrtc/webrtcService.ts:364` | `createPeerConnection()` |
| `ChatApp/src/services/webrtc/webrtcService.ts:416` | ICE restart logic |
| `ChatApp/src/services/webrtc/webrtcService.ts:439` | Emit `call_failed` (không handler BE) |
| `ChatApp/src/services/webrtc/webrtcService.ts:521` | `startStatsPolling()` adaptive quality |
| `ChatApp/src/hooks/useIncomingCall.ts:33` | Navigate to `IncomingCallModal` |
| `ChatApp/src/hooks/useWebRTC.ts:27` | `setupCall()` — mount effect |
| `ChatApp/src/screens/call/IncomingCallScreen.tsx:26` | Ringtone + emitRinging |
| `ChatApp/src/screens/call/IncomingCallScreen.tsx:63` | `handleAccept()` |
| `ChatApp/src/screens/call/CallScreen.tsx:70` | `handleEndOrCancel` |
| `ChatApp/src/screens/main/CallsScreen.tsx:170` | `handleCallBack()` từ lịch sử |
| `ChatApp/src/screens/chat/ChatScreen.tsx:704` | `handleStartCall()` từ chat |
| `ChatApp/src/screens/chat/ChatScreen.tsx:760-765` | **Thiếu `remoteUser` khi navigate** |
| `ChatApp/src/navigation/RootNavigator.tsx:8` | Import `screens/call/CallScreen` |
| `ChatApp/src/navigation/RootNavigator.tsx:40` | `IncomingCallModal` với `gestureEnabled: false` |

---

## 12. Tóm tắt flow

**Outgoing call**:
`ChatScreen.handleStartCall()` / `CallsScreen.handleCallBack()` → `webrtcService.initiateCall()` → socket `call_initiate` → backend tạo session Redis + log MongoDB (`status: 'missed'` mặc định) → `turnService.getIceServers()` → emit `incoming_call` cho callee + `call_initiated` cho caller → caller navigate `CallModal` (isInitiator: true) → callee navigate `IncomingCallModal`.

**Accept**:
`IncomingCallScreen.handleAccept()` → `webrtcService.acceptCall()` → socket `call_accept` → backend update session `active`, log `answeredAt + status: 'answered'`, emit `call_cancelled` cho các device khác của callee → emit `call_accepted` cho caller → cả hai vào `CallScreen` → `useWebRTC.setupCall()` → caller `createOffer` → SDP exchange → ICE exchange → `connectionState: connected` → state `active`.

**Hangup**:
`CallScreen.handleEndOrCancel()` → `webrtcService.endCall()` → socket `call_end` → backend tính duration, update log `status: 'ended'`, emit `call_ended` cho tất cả participants → cả hai cleanup và navigate back.

**Callee offline**:
Backend detect `targetSockets.length === 0` → end session ngay → update log `missed` → emit `call_missed` cho caller. **Không có FCM push** ⚠️.

**Timeout**:
In-memory `setTimeout(30s)` trong gateway → end session → update log `missed` → emit `call_missed` cho caller + `call_timeout` cho callee. Backup: cron mỗi phút cleanup sessions > 60s (độ trễ ~2 phút nếu server restart).

---

## 13. Khuyến nghị ưu tiên

| Priority | Item | Effort |
|---|---|---|
| P0 | Thêm FCM push cho incoming call khi callee offline (hoặc CallKit/ConnectionService) | Cao |
| P0 | Thêm handler `call_failed` ở backend để cleanup session | Thấp |
| P1 | Truyền `remoteUser` từ ChatScreen vào CallModal | Thấp |
| P1 | Xóa dead code `screens/main/CallScreen.tsx` + `CallNavigator.tsx` | Thấp |
| P1 | Giảm cron interval xuống 15s hoặc dùng Redis keyspace notifications | Trung bình |
| P2 | Rate limiting `call_initiate` | Thấp |
| P2 | Re-auth khi JWT expire giữa cuộc gọi | Trung bình |
| P2 | Observability: log call quality metrics | Trung bình |
| P3 | Thiết kế lại group call (SFU/MCU) nếu cần > 3 người | Cao |

---

*Báo cáo kết thúc.*
