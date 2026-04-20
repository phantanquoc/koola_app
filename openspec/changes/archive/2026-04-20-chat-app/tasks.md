## 1. Infrastructure Setup

- [ ] 1.1 Provision VM1 on Proxmox: Ubuntu 22.04 LTS, 2 vCPU, 4GB RAM, 50GB disk
- [ ] 1.2 Provision VM2 on Proxmox: Ubuntu 22.04 LTS, 2 vCPU, 4GB RAM, 100GB disk (MongoDB data)
- [ ] 1.3 Provision VM3 on Proxmox: Ubuntu 22.04 LTS, 1 vCPU, 2GB RAM (MinIO + Coturn)
- [ ] 1.4 Provision VM4 on Proxmox: Ubuntu 22.04 LTS, 1 vCPU, 1GB RAM, 2GB disk (Redis) ← (verify: all 4 VMs accessible via SSH, firewall rules applied)
- [ ] 1.5 Install Docker on VM1, VM3, VM4
- [ ] 1.6 Install MongoDB 7 on VM2 (single instance, bind 0.0.0.0:27017)
- [ ] 1.7 Install Redis 7 on VM4 (Docker, bind 0.0.0.0:6379, no password for MVP)
- [ ] 1.8 Install MinIO on VM3 (Docker, ports 9000/9001, data dir on Proxmox volume) ← (verify: MinIO console accessible, test bucket created)
- [ ] 1.9 Install Coturn on VM3 (Docker, UDP/TCP 3478, realm set to VM3 public IP, static-auth-secret configured) ← (verify: STUN test via https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)
- [ ] 1.10 Create Proxmox backup/snapshot schedule (daily snapshot before Phase 1 goes live)
- [ ] 1.11 Configure DNS / static IP for all VMs; document internal IPs

## 2. Backend — Project Setup

- [ ] 2.1 Initialize NestJS project on VM1: `nest new chat-backend`, TypeScript strict mode
- [ ] 2.2 Install core dependencies: `@nestjs/mongoose`, `mongoose`, `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `bcrypt`, `class-validator`, `class-transformer`, `@nestjs/platform-socket.io`, `socket.io`, `@nestjs/websockets`, `@nestjs/config`, `@nestjs/throttler`, `firebase-admin`, `minio`, `ioredis`, `@nestjs/serve-static`
- [ ] 2.3 Configure environment variables (`.env`): MongoDB URI, Redis URL, MinIO endpoint/credentials, JWT secret, Coturn public IP
- [ ] 2.4 Create `src/common/` structure: guards (JwtAuthGuard, WebSocketAuthGuard), decorators (CurrentUser), interceptors (TransformInterceptor, LoggingInterceptor), filters (HttpExceptionFilter), dto.validation pipe
- [ ] 2.5 Configure MongoDB connection: `MongooseModule.forRoot()` pointing to VM2 MongoDB
- [ ] 2.6 Configure Redis connection via `ioredis` (for Socket.io adapter + cache)
- [ ] 2.7 Configure app CORS: allow React Native dev server + production domain
- [ ] 2.8 Configure ThrottlerModule: 60 requests/min per user for messages, 1000 requests/min for auth
- [ ] 2.9 Setup Swagger (OpenAPI) at `/api/docs` ← (verify: Swagger UI accessible at /api/docs)

## 3. Backend — Auth Module

- [ ] 3.1 Create `users` MongoDB schema: `email` (unique), `passwordHash`, `displayName`, `avatar`, `createdAt`, `updatedAt`
- [ ] 3.2 Create indexes: `email` (unique), `createdAt`
- [ ] 3.3 Create `auth` schema: `refreshTokenHash`, `userId`, `createdAt`, `revokedAt`
- [ ] 3.4 POST /auth/register: validate DTO, hash password (bcrypt 12 rounds), create user, return JWT access + refresh tokens ← (verify: register works, duplicate email returns 409)
- [ ] 3.5 POST /auth/login: validate credentials, verify password, issue access + refresh tokens, store hashed refresh token in DB ← (verify: login works with correct credentials, returns 401 with wrong password)
- [ ] 3.6 POST /auth/refresh: validate refresh token, check not revoked, rotate token (hash new refresh token, revoke old), return new pair ← (verify: token rotation works, old refresh token fails after use)
- [ ] 3.7 POST /auth/logout: revoke refresh token, remove FCM tokens ← (verify: logged-out token cannot refresh)
- [ ] 3.8 JWT access token payload: `{ sub: userId, email, iat, exp }`. Refresh token payload: `{ sub: userId, jti: tokenId }`
- [ ] 3.9 Apply `JwtAuthGuard` globally to all routes except `/auth/register`, `/auth/login`, `/auth/refresh`, `/health`

## 4. Backend — Users Module

- [ ] 4.1 Extend `users` schema: add `isOnline: boolean`, `lastSeen: Date`, `fcmTokens: [{ token, platform, createdAt }]`, `settings: { notificationsEnabled: boolean }`
- [ ] 4.2 GET /users/me: return current user profile (without sensitive fields) ← (verify: returns correct user data)
- [ ] 4.3 PUT /users/me: update displayName, avatar
- [ ] 4.4 PUT /users/me/avatar: handle avatar upload via MinIO presigned URL flow ← (verify: avatar URL stored correctly, accessible publicly)
- [ ] 4.5 PUT /users/me/settings: update notification preferences
- [ ] 4.6 PUT /users/me/fcm-token: add or update FCM token with platform ← (verify: token stored, duplicates replaced)
- [ ] 4.7 DELETE /users/me/fcm-token: remove FCM token on logout
- [ ] 4.8 GET /users/:userId/presence: return `{ isOnline, lastSeen }` only if user is in a shared conversation ← (verify: returns 403 for non-contacts)
- [ ] 4.9 GET /users/presence?ids=id1,id2: batch presence query ← (verify: returns array of presence objects)

## 5. Backend — Conversations Module

- [ ] 5.1 Create `conversations` schema: `_id`, `type: "direct"|"group"`, `name` (group only), `avatar` (group only), `members: [userId]`, `createdBy`, `createdAt`, `updatedAt`, `lastMessageAt`, `lastMessagePreview`
- [ ] 5.2 Create indexes: `members` (multikey), `lastMessageAt` (descending), `type`
- [ ] 5.3 POST /conversations: create group conversation, validate 2-100 members, add creator + members, return conversation ← (verify: group created with correct members, returns 400 for <2 members)
- [ ] 5.4 POST /conversations/:conversationId/members: add member (admin only) ← (verify: admin can add, non-admin gets 403, non-member gets 404)
- [ ] 5.5 DELETE /conversations/:conversationId/members/:userId: remove member (admin only); DELETE /conversations/:conversationId/members/me for self-remove ← (verify: removed user cannot access conversation)
- [ ] 5.6 GET /conversations: paginated list, sorted by lastMessageAt desc, populate members summary, include unreadCount ← (verify: correct pagination, correct sort order)
- [ ] 5.7 GET /conversations/:conversationId: full details with all members populated ← (verify: non-member gets 404)
- [ ] 5.8 Conversation existence helper: `isMember(userId, conversationId)` used in all guards
- [ ] 5.9 System message injection on member add/remove: insert `type: "system"` message on member change ← (verify: system messages appear in conversation)

## 6. Backend — Messages Module

- [ ] 6.1 Create `messages` schema: `_id`, `conversationId`, `senderId`, `type: "text"|"image"|"file"|"voice"|"system"`, `content`, `status: "sending"|"sent"|"delivered"|"read"`, `mediaUrl`, `mediaKey`, `mediaMimeType`, `mediaSize`, `thumbnailKey`, `clientMessageId`, `deleted: boolean`, `createdAt`, `updatedAt`, `deletedAt`
- [ ] 6.2 Create MongoDB text index on `content` field for search
- [ ] 6.3 Create indexes: `conversationId + createdAt` (compound), `clientMessageId + createdAt` (for dedup), `senderId`
- [ ] 6.4 POST /conversations/:conversationId/messages: create message, update conversation `lastMessageAt`, emit `new_message` via gateway, queue FCM for offline recipients ← (verify: message saved, WebSocket event emitted to room, FCM sent to offline users)
- [ ] 6.5 GET /conversations/:conversationId/messages: cursor-based pagination, 20 messages per page, newest first ← (verify: correct pagination with cursor)
- [ ] 6.6 DELETE /conversations/:conversationId/messages/:messageId: soft delete (deleted: true), replace content with "This message was deleted" ← (verify: sender can delete within 24h, gets 403 after 24h or if not sender)
- [ ] 6.7 GET /conversations/:conversationId/messages/search: full-text search within conversation ← (verify: returns matching messages, excludes deleted)
- [ ] 6.8 GET /messages/search: global search across all user conversations ← (verify: returns messages from all conversations with conversationId context)
- [ ] 6.9 GET /messages/sync: fetch messages with `createdAt > since` for offline sync ← (verify: returns correct messages for given user since timestamp)
- [ ] 6.10 Rate limiting: apply ThrottlerGuard on message send endpoint (60/min per user) ← (verify: 61st message returns 429)
- [ ] 6.11 Message dedup: check `clientMessageId` exists in last 5 minutes; if yes, return existing message without creating ← (verify: duplicate with same clientMessageId returns same message, not duplicated)

## 7. Backend — Media Storage Module

- [x] 7.1 Configure MinIO client in NestJS using `minio` npm package with VM3 endpoint
- [x] 7.2 POST /media/upload: validate MIME type and size (≤100MB), generate MinIO presigned PUT URL (15 min expiry), return `{ uploadUrl, mediaKey }` ← (verify: presigned URL works, file uploaded to MinIO, 100MB+ file rejected)
- [x] 7.3 GET /media/:mediaKey: verify user is in conversation that referenced this media, generate MinIO presigned GET URL (1h expiry) ← (verify: non-conversation member gets 403)
- [x] 7.4 DELETE /media/:mediaKey: mark media as deleted in DB, background job removes orphaned files after 30 days ← (verify: deleted media not accessible via GET)

## 8. Backend — Notifications Module (FCM)

- [x] 8.1 Initialize Firebase Admin SDK with service account JSON from Firebase console
- [x] 8.2 `sendPushNotification(userId, payload)` function: fetch user's FCM tokens from DB, send FCM to all tokens, remove invalid tokens on error ← (verify: FCM sent to offline user, invalid token removed from DB)
- [x] 8.3 Integrate into message send flow: if recipient is offline AND `notificationsEnabled === true`, call `sendPushNotification`
- [x] 8.4 Notification deduplication: before sending, check if a notification was sent to this conversation in the last 5 seconds; if yes, skip individual FCM and send a "X new messages" summary instead
- [x] 8.5 Payload builder: construct correct notification body for direct/group, text/image/file types ← (verify: direct vs group notification titles differ correctly)
- [x] 8.6 Firebase project setup guide in README: create Firebase project, enable FCM, get service account JSON, add Android SHA-1, add iOS APNs key ← (verify: FCM token registered, notification received on Android)

## 9. Backend — WebSocket Gateway

- [x] 9.1 Create `@WebSocketGateway({ namespace: '/chat', cors: { origin: '*' } })`
- [x] 9.2 WebSocketAuthGuard: extract JWT from `handshake.query.token`, validate, attach user to socket ← (verify: invalid token closes connection with code 4001)
- [x] 9.3 On connection: mark user online, join personal room `user:<userId>`, start heartbeat monitor ← (verify: on connect, `isOnline: true` in DB, `presence_update` broadcast)
- [x] 9.4 On disconnect: stop heartbeat, after 30s no heartbeat → mark offline, broadcast `presence_update` ← (verify: disconnect causes user offline after 30s)
- [x] 9.5 `join_conversation`: verify membership, join `conversation:<conversationId>` room, emit `joined` ack ← (verify: non-member gets error)
- [x] 9.6 `leave_conversation`: leave `conversation:<conversationId>` room ← (verify: user stops receiving messages for that conversation)
- [x] 9.7 `send_message` (WS): validate, save to MongoDB, emit `message_ack` to sender, broadcast `new_message` to conversation room, queue FCM ← (verify: sender gets ack, others get new_message)
- [x] 9.8 `typing_start` / `typing_stop`: debounce on server (500ms), broadcast `user_typing` to conversation room; auto-stop after 5s if no stop event ← (verify: typing indicator appears/disappears on other clients)
- [x] 9.9 `mark_read`: update message status, emit `message_read` to sender's personal room ← (verify: sender gets ✓✓ read receipt)
- [x] 9.10 `presence_update`: update user status, broadcast to all shared conversations
- [x] 9.11 Redis Socket.io adapter: configure `@nestjs/platform-socket.io` with Redis adapter for multi-instance support ← (verify: message sent from server 1 reaches client on server 2)

## 10. Backend — WebRTC Signaling

- [ ] 10.1 `call_initiate` event: validate both users are in conversation, emit `incoming_call` to target, return session ID + ICE server config to caller ← (verify: callee receives incoming_call event)
- [ ] 10.2 `call_offer` / `call_answer`: relay SDP between callers' personal rooms ← (verify: caller receives answer, callee receives offer)
- [ ] 10.3 `call_ice_candidate`: relay ICE candidates between callers' personal rooms ← (verify: ICE candidates received by both parties)
- [ ] 10.4 `call_accept` / `call_decline` / `call_end`: manage call state, emit appropriate events, start 60s timeout for unanswered calls ← (verify: unanswered call times out after 60s)
- [ ] 10.5 ICE server config endpoint: generate TURN credentials using HMAC-SHA1 with `static-auth-secret`, return STUN + TURN server config with coturn public IP
- [ ] 10.6 Group call: `call_initiate` in group sends `incoming_call` to all other online members ← (verify: all group members receive incoming_call)
- [ ] 10.7 Coturn health check: `GET /health` verifies Coturn port 3478 is reachable ← (verify: health endpoint fails if Coturn is down)

## 11. Backend — Health & Monitoring

- [ ] 11.1 GET /health: returns `{ status: "ok", mongodb: "ok", redis: "ok", minio: "ok", coturn: "ok" }` ← (verify: endpoint returns correct status for each service)
- [ ] 11.2 Request logging: log all incoming requests with method, path, status, response time, userId
- [ ] 11.3 Error logging: structured JSON logs with stack traces for 5xx errors

## 12. Backend — End-to-End Verification

- [ ] 12.1 Manual E2E test: register two users, log in both, send messages between them, verify WebSocket events received ← (verify: full message flow works end-to-end)
- [ ] 12.2 Manual E2E test: create group, add members, send message, verify all members receive ← (verify: all group members receive message)
- [ ] 12.3 Manual E2E test: send message to offline user, verify FCM notification sent ← (verify: FCM payload received on device)
- [ ] 12.4 Manual E2E test: send message offline, reconnect, verify queued message delivered + missed messages synced ← (verify: offline message queue works correctly)

## 13. React Native — Project Setup

- [ ] 13.1 Initialize React Native project: `npx react-native@latest init ChatApp --version 0.76.x` (new architecture enabled)
- [ ] 13.2 Install dependencies:
  - Navigation: `@react-navigation/native`, `@react-navigation/native-stack`, `@react-navigation/bottom-tabs`
  - WebSocket: `socket.io-client`
  - Storage: `@react-native-async-storage/async-storage` (or `react-native-mmkv` v3)
  - Network: `@react-native-community/netinfo`
  - Permissions: `react-native-permissions`
  - Media: `react-native-image-picker`, `react-native-document-picker`
  - Push: `@react-native-firebase/app`, `@react-native-firebase/messaging`
  - UI: `react-native-gifted-chat` (chat UI components), `react-native-vector-icons`
  - Utils: `axios`, `date-fns`, `uuid`
- [ ] 13.3 Configure iOS CocoaPods: `cd ios && pod install`
- [ ] 13.4 Configure Android: add FCM `google-services.json`, add camera/storage permissions in AndroidManifest.xml
- [ ] 13.5 Configure iOS: add FCM APNs capability in Xcode, add camera/microphone/photo library permissions in Info.plist
- [ ] 13.6 Setup environment config: `API_URL` (NestJS backend), `WS_URL` (WebSocket endpoint)
- [ ] 13.7 Setup Hermes JS engine (default in RN 0.76+)
- [ ] 13.8 Test build: `cd android && ./gradlew assembleDebug` and `xcodebuild` for iOS ← (verify: debug APK built successfully, JS bundle included)

## 14. React Native — Auth Screens & State

- [ ] 14.1 Create `AuthContext`: stores `{ user, accessToken, isAuthenticated }`, provides `login()`, `register()`, `logout()`, `refreshToken()`
- [ ] 14.2 Create `AuthNavigator`: Stack Navigator for login/register screens
- [ ] 14.3 Login screen: email + password inputs, "Login" button, loading state, error display ← (verify: successful login navigates to main app, wrong credentials shows error)
- [ ] 14.4 Register screen: email + password + displayName inputs, "Register" button, loading state, validation errors ← (verify: successful registration auto-logs in)
- [ ] 14.5 Token storage: store refresh token in AsyncStorage, access token in memory (AuthContext state)
- [ ] 14.6 Token refresh: Axios interceptor retries request with new token when 401 received ← (verify: 401 triggers refresh, new token used for retry)
- [ ] 14.7 Auto-login on app start: check AsyncStorage for refresh token, call refresh endpoint, restore session ← (verify: app restores session on cold start)

## 15. React Native — Navigation & App Shell

- [ ] 15.1 Create `MainNavigator`: Bottom Tab Navigator with 3 tabs: Chats, Contacts, Profile
- [ ] 15.2 Create `AppNavigator`: Stack containing AuthNavigator and MainNavigator (conditional based on isAuthenticated)
- [ ] 15.3 Root `App.tsx`: wraps with AuthContext.Provider, NetworkProvider (NetInfo), PushNotificationProvider
- [ ] 15.4 Tab bar icons: Chats (message-circle), Contacts (users), Profile (user)
- [ ] 15.5 Deep linking: configure for `chatapp://` scheme and universal links ← (verify: tapping notification deep-links to correct conversation)

## 16. React Native — Conversation List Screen

- [ ] 16.1 `ConversationListScreen`: FlatList of conversation items, sorted by `lastMessageAt` descending
- [ ] 16.2 Conversation item: avatar, name (or "User X" for direct), last message preview (truncated), timestamp, unread badge ← (verify: unread count shown when > 0)
- [ ] 16.3 Pull-to-refresh: calls `GET /conversations`, replaces list ← (verify: list refreshes on pull)
- [ ] 16.4 Create group FAB: button that navigates to `CreateGroupScreen` ← (verify: group created, appears in list)
- [ ] 16.5 Empty state: illustration + "Start your first conversation" message when list is empty
- [ ] 16.6 Loading skeleton while fetching ← (verify: skeleton shown on first load)

## 17. React Native — Chat Screen

- [ ] 17.1 `ChatScreen`: full-screen chat using `react-native-gifted-chat` (or custom implementation)
- [ ] 17.2 Message list: inverted FlatList, 20 messages loaded initially, load more on scroll to top ← (verify: older messages load on scroll)
- [ ] 17.3 Send text message: optimistic UI (show "sending..."), POST to API, on ack update status ← (verify: message appears immediately, status updates on ack)
- [ ] 17.4 Send image: open image picker, get presigned URL, upload to MinIO, POST message with `mediaUrl` ← (verify: image shown in chat after upload)
- [ ] 17.5 Send file: document picker, upload via presigned URL, POST message with `mediaUrl` + `content` = filename ← (verify: file message shown with filename and size)
- [ ] 17.6 Read receipts: show ✓ / ✓✓ based on `status` field ← (verify: ✓ shown on sent, ✓✓ shown when read)
- [ ] 17.7 Typing indicator: show "typing..." text when `user_typing` event received ← (verify: typing indicator appears/disappears)
- [ ] 17.8 Online/offline status: show green dot on header if recipient is online ← (verify: green dot shows when online, last seen shows when offline)
- [ ] 17.9 Message search bar: navigate to `SearchScreen` with conversation context ← (verify: search results shown within conversation)
- [ ] 17.10 Message deletion: long-press on own message → "Delete" option → DELETE API → update UI ← (verify: deleted message shows "This message was deleted")
- [ ] 17.11 Group header: show member avatars, tap to show member list sheet

## 18. React Native — WebSocket Client

- [ ] 18.1 Create `SocketService`: singleton managing Socket.io connection, `connect(token)`, `disconnect()`, `reconnect()`
- [ ] 18.2 Connect on login: after successful auth, connect to WebSocket with access token ← (verify: connection established, user marked online)
- [ ] 18.3 Reconnect logic: on disconnect, exponential backoff (1s, 2s, 4s, 8s, max 30s), max 10 retries, then show "Connection lost" banner
- [ ] 18.4 Heartbeat: send `ping` every 15 seconds, update `lastSyncAt` on successful reconnect ← (verify: heartbeat keeps connection alive)
- [ ] 18.5 Handle incoming events: `new_message` → append to conversation state, `message_ack` → update message status, `message_read` → update read receipts, `user_typing` → trigger typing indicator, `presence_update` → update user online status
- [ ] 18.6 Emit on message send: `send_message` event, wait for `message_ack` to confirm ← (verify: message confirmed on ack)
- [ ] 18.7 Emit on read: `mark_read` when message enters viewport ← (verify: sender sees ✓✓)
- [ ] 18.8 Emit on typing: debounce 500ms client-side, emit `typing_start`/`typing_stop` ← (verify: other side sees typing indicator after 500ms delay)
- [ ] 18.9 Disconnect on logout: call `disconnect()` before clearing auth state ← (verify: user marked offline on logout)
- [ ] 18.10 Socket events logging in development (toggleable) ← (verify: events logged in debug mode)

## 19. React Native — Offline Support

- [ ] 19.1 Create `OfflineQueueService`: `queueMessage(message)`, `processQueue()`, `clearQueue()`
- [ ] 19.2 NetInfo listener: subscribe to `netInfo.addEventListener`, on `isConnected === false` → disconnect socket, show offline banner; on `isConnected === true` → reconnect socket, process queue, sync messages ← (verify: offline banner shows, queue processes on reconnect)
- [ ] 19.3 Queue persistence: save queue to AsyncStorage on every change, restore on app restart ← (verify: queue survives app restart)
- [ ] 19.4 Process queue: iterate queue sequentially, POST each message, remove from queue on success, increment retryCount on failure ← (verify: queued messages sent in order on reconnect)
- [ ] 19.5 Exponential backoff: `wait = min(2^retryCount * 1000, 30000)`, max 5 retries ← (verify: retry after correct delay, stops after 5 retries)
- [ ] 19.6 Sync missed messages: on reconnect, `GET /messages/sync?since=<lastSyncAt>` → merge into conversation state → update `lastSyncAt` ← (verify: messages received while offline appear in chat)
- [ ] 19.7 Deduplication: when syncing, skip messages with IDs already in local state ← (verify: no duplicate messages after reconnect)
- [ ] 19.8 Optimistic message failure: if queue message fails all retries → show "Failed to send" with "Retry" button ← (verify: failed message can be retapped and resent)
- [ ] 19.9 Persist `lastSyncAt` in MMKV/AsyncStorage ← (verify: `lastSyncAt` survives app restart)

## 20. React Native — Contacts & Profile Screens

- [ ] 20.1 `ContactsScreen`: list of all users (for starting new 1-on-1 conversations), search bar ← (verify: can search users by name)
- [ ] 20.2 Tap contact → navigate to existing direct conversation or create one in-memory, then navigate to `ChatScreen`
- [ ] 20.3 `ProfileScreen`: display avatar, name, email; "Edit Profile" button → update displayName; "Change Avatar" button → image picker → upload via MinIO presigned URL ← (verify: profile updates reflected immediately)
- [ ] 20.4 `NotificationSettingsScreen`: toggle `notificationsEnabled` via API ← (verify: setting saved to server)
- [ ] 20.5 Logout button: calls `logout()` → clears tokens → navigates to Auth screen ← (verify: logged out state restored on next app open)

## 21. React Native — Push Notifications

- [ ] 21.1 Request FCM permission on iOS: `messaging().requestPermission()` ← (verify: permission dialog shown, granted state handled)
- [ ] 21.2 Register FCM token on login: `PUT /users/me/fcm-token` ← (verify: token registered in backend)
- [ ] 21.3 Handle foreground notifications: `messaging().onMessage()` → show in-app alert/banner ← (verify: notification shown when app is in foreground)
- [ ] 21.4 Handle background notifications: tapping notification → navigate to conversation from `data.conversationId` ← (verify: tapping notification opens correct chat)
- [ ] 21.5 Clear FCM token on logout ← (verify: old token removed from server on logout)
- [ ] 21.6 iOS: handle APNs background notifications for sync ← (verify: background messages trigger sync)

## 22. React Native — Audio/Video Call (Phase 2 — Setup Structure)

- [ ] 22.1 Install `react-native-webrtc`: `npm install react-native-webrtc` + pod install
- [ ] 22.2 Create `CallScreen`: full-screen view with local and remote video views ← (verify: local preview shown)
- [ ] 22.3 Create `CallService`: manages WebRTC peer connection, handles offer/answer/ICE exchange via Socket.io events
- [ ] 22.4 Implement `call_initiate` → receive `incoming_call` → show call screen
- [ ] 22.5 Implement accept/decline/end: emit events, update local state ← (verify: call accepted/declined reflected in UI)
- [ ] 22.6 Configure ICE servers from backend endpoint ← (verify: TURN server used when STUN fails)
- [ ] 22.7 Audio route: speaker/earpiece toggle, mute/unmute ← (verify: audio route switches correctly)
- [ ] 22.8 Incoming call notification: when app in background → show local notification ← (verify: incoming call shown as notification)

## 23. Documentation

- [ ] 23.1 README.md: project overview, architecture diagram, prerequisites, local development setup (run backend + client), environment variables reference
- [ ] 23.2 API documentation: Swagger at `/api/docs` for REST endpoints
- [ ] 23.3 WebSocket events documentation: `EVENTS.md` listing all client→server and server→client events with payloads
- [ ] 23.4 Proxmox setup guide: step-by-step VM provisioning, Docker installation, service configuration for each VM
- [ ] 23.5 Firebase setup guide: create project, enable FCM, configure Android SHA-1, configure iOS APNs key
- [ ] 23.6 MinIO setup guide: bucket creation, access policy for presigned URLs
- [ ] 23.7 Coturn setup guide: Docker compose, `coturn.conf`, TURN credential generation, firewall rules
