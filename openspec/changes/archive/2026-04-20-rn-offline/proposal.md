## Why

React Native clients need to handle real-world network instability gracefully. Users send messages while in elevators, subways, or areas with poor connectivity. Without offline support, messages are silently lost and users have no feedback. This change implements the offline-first message queue, message sync on reconnect, and network connectivity monitoring defined in the `offline-queue` spec.

## What Changes

- **New RN offline queue**: Messages sent while offline are persisted to AsyncStorage and retried automatically on reconnect with exponential backoff.
- **New RN sync mechanism**: On WebSocket reconnect, client fetches missed messages via `GET /messages/sync` and merges them into local state with deduplication.
- **New RN network monitoring**: `@react-native-community/netinfo` monitors connectivity and controls WebSocket lifecycle + shows offline banner.
- **New RN backend sync endpoint**: `GET /messages/sync?since=<ISO8601>` endpoint on NestJS backend returns all messages created after a given timestamp.
- **Updated optimistic UI**: Message send flow goes through the offline queue layer so it works identically online and offline.
- **Updated offline queue persistence**: Queue and sync state survive app restarts via AsyncStorage.

## Capabilities

### New Capabilities

- `offline-queue`: Covers the offline message queue, retry with exponential backoff, and optimistic UI update semantics. Spec already exists at `openspec/changes/chat-app/specs/offline-queue/spec.md` — this change implements it.

### Modified Capabilities

- `messaging`: Backend `GET /messages/sync` endpoint adds a new server-side capability (not a requirement change to existing behavior — purely additive).

## Impact

**React Native (`ChatApp/`):**
- New: `OfflineQueueService`, `useNetworkStatus`, `useOfflineQueue`, `useMessageSync` hooks
- New: `OfflineBanner` component
- Modified: `ChatScreen`, `useMessages`, `App`, `ConversationListScreen`

**NestJS Backend (`chat-backend/`):**
- New: `GET /messages/sync` endpoint + DTO + service method

**Dependencies:**
- `@react-native-community/netinfo` — already in `package.json`
- `@react-native-async-storage/async-storage` — already in `package.json`

**No breaking changes** to existing API contracts or user-facing behavior.
