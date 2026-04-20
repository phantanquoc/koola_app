## Why

Building a full-featured real-time chat application (1-on-1 and group) as a mobile app. The app enables users to communicate instantly with text, media, and real-time presence — combining the core capabilities of modern messaging platforms into a single product. Phase 1 delivers a complete, shippable MVP with text messaging, media sharing, and push notifications. Subsequent phases add voice messages, audio/video calls, and end-to-end encryption.

## What Changes

Phase 1 introduces the following new capabilities:

- **User authentication** — Email + password registration and login, JWT access tokens (1h) with refresh tokens (30 days)
- **User presence** — Real-time online/offline status, last seen timestamps
- **1-on-1 conversations** — Private messaging between two users
- **Group conversations** — Group chats with up to 100 members, create group, add/remove members
- **Text messaging** — Real-time send/receive with delivery and read receipts, typing indicators
- **Media sharing** — Upload and send images and files (max 100MB per file)
- **Message search** — Search message content within a conversation
- **Push notifications** — FCM push notifications when user is offline
- **Offline support** — Optimistic UI updates, local message queue, full sync on reconnect
- **WebSocket real-time layer** — Hybrid REST (message CRUD) + WebSocket (events: typing, presence, new message, read receipt)
- **Coturn TURN server** — Self-hosted on Proxmox for WebRTC call connectivity behind restrictive NATs

Phase 2 adds: voice messages, audio/video WebRTC calls

Phase 3 adds: end-to-end encryption (libsodium/XChaCha20-Poly1305), message reactions, reply threads

## Capabilities

### New Capabilities

- `user-auth`: Email + password auth with JWT access (1h) and refresh tokens (30 days). Refresh tokens stored in DB and rotated on use.
- `user-presence`: Online/offline status, last seen, updated via WebSocket heartbeat. Used to show green/gray indicators on contact list.
- `conversation-management`: Create and manage 1-on-1 (auto-created on first message) and group (up to 100 members) conversations. Members can be added/removed. Group metadata (name, avatar) is editable.
- `messaging`: Text message send/receive within conversations. Message status: `sending → sent → delivered → read`. Messages support text, image, file types. Pagination via cursor-based loading (20 messages per page).
- `real-time-gateway`: NestJS WebSocket Gateway with Socket.io. Handles: `join_conversation`, `send_message`, `typing_start/stop`, `mark_read`, `presence_update`. Server emits: `new_message`, `message_ack`, `user_typing`, `presence_update`, `message_delivered`, `message_read`.
- `media-storage`: MinIO (S3-compatible) on Proxmox. NestJS generates presigned URLs for direct upload from React Native client. Supports images and files up to 100MB.
- `notification-push`: FCM integration. When a message is sent and recipient is offline, NestJS sends a push notification via Firebase Admin SDK.
- `offline-queue`: React Native side — NetInfo monitors connectivity, AsyncStorage queues outgoing messages, exponential backoff retry on reconnect. On reconnect: sync queued messages via REST, fetch missed messages via `GET /messages?since={lastSyncAt}`.
- `message-search`: MongoDB full-text search index on message content. Search scoped per conversation.
- `webrtc-signaling`: NestJS WebSocket gateway relays WebRTC SDP offers/answers and ICE candidates between callers. Coturn (self-hosted on Proxmox) provides TURN relay for calls behind restrictive NATs.
- `coturn-server`: Self-hosted Coturn TURN/STUN server on Proxmox VM. STUN for public IP discovery, TURN for relay when P2P fails. Configured as fallback in WebRTC ICE servers list.

### Modified Capabilities

_(None — this is a greenfield project)_

## Impact

### Backend (NestJS)
- New modules: `auth`, `users`, `conversations`, `messages`, `notifications`, `gateway`, `media`
- WebSocket gateway on same port as REST API via `NestJS` adapter
- Redis for WebSocket adapter (for future horizontal scaling)
- MinIO SDK for presigned URL generation
- Firebase Admin SDK for FCM push

### Mobile (React Native)
- `react-native-socket.io-client` for WebSocket connection
- `react-native-document-picker` + `react-native-image-picker` for media
- `NetInfo` for connectivity monitoring
- `react-native-mmkv` or `@react-native-async-storage/async-storage` for offline queue
- `react-native-permissions` for camera/mic/storage permissions
- Firebase SDK for FCM

### Infrastructure (Proxmox)
- VM1: NestJS backend (:3000)
- VM2: MongoDB (single instance)
- VM3: MinIO (:9000) + Coturn (:3478)
- VM4: Redis (:6379)

### External Dependencies
- Firebase project (FCM) — free tier
- Coturn — self-hosted, free
- MinIO — self-hosted on Proxmox storage, free
