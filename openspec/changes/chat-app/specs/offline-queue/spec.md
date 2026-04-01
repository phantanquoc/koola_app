## ADDED Requirements

### Requirement: Offline Message Queue
The React Native client SHALL queue outgoing messages locally when there is no network connectivity.

#### Scenario: Send message while offline
- **WHEN** user sends a message and `NetInfo.isConnected === false`
- **THEN** client saves message to AsyncStorage queue with `{ id, conversationId, content, type, status: "pending", createdAt, retryCount: 0 }`, shows message in UI with "sending..." indicator

#### Scenario: Retry queue on reconnect
- **WHEN** `NetInfo.isConnected` changes from `false` to `true`
- **THEN** client iterates the queue in order, POSTs each message to `/messages`, on HTTP 200 removes from queue, on failure increments `retryCount`, applies exponential backoff

#### Scenario: Exponential backoff
- **WHEN** a queued message fails to send
- **THEN** client retries after `min(2^retryCount * 1000, 30000)` milliseconds, up to 5 retries

#### Scenario: Queue cleared on max retries
- **WHEN** a queued message reaches `retryCount === 5`
- **THEN** client removes from queue, shows "Failed to send" error in UI, offers "Retry" button

### Requirement: Sync Missed Messages on Reconnect
The React Native client SHALL fetch missed messages on WebSocket reconnect.

#### Scenario: Sync on reconnect
- **WHEN** WebSocket reconnects successfully after being disconnected
- **THEN** client calls `GET /messages/sync?since=<lastSyncAt>` to fetch all messages received while offline, merges them into local state, updates `lastSyncAt`

#### Scenario: Sync pagination
- **WHEN** more than 100 messages were missed
- **THEN** client paginates: calls `GET /messages/sync?since=<lastSyncAt>&cursor=<lastMessageId>` until all messages are fetched

#### Scenario: Deduplication on sync
- **WHEN** a message received via WebSocket during reconnect overlap with a message returned from `/sync`
- **THEN** client deduplicates by messageId, keeps the version with the later timestamp

### Requirement: Local Storage for Sync State
The React Native client SHALL persist sync state across app restarts.

#### Scenario: Persist lastSyncAt
- **WHEN** client finishes syncing messages
- **THEN** client stores `lastSyncAt` (ISO8601 timestamp) in MMKV/AsyncStorage; on app restart this value is used as the `since` parameter for first sync

#### Scenario: Persist offline queue
- **WHEN** user sends a message while offline
- **THEN** queue is persisted to AsyncStorage; on app restart, queue is restored and retry continues

### Requirement: Optimistic UI Updates
The React Native client SHALL update the UI optimistically before server confirmation.

#### Scenario: Optimistic message display
- **WHEN** user sends a message
- **THEN** client immediately prepends message to conversation screen with `status: "sending"`; on `message_ack` from server, status updates to "sent"

#### Scenario: Optimistic message failure
- **WHEN** a message sent optimistically fails to deliver after max retries
- **THEN** client updates message status to "failed" with red indicator and "Tap to retry" label

### Requirement: Connectivity Monitoring
The React Native client SHALL monitor network connectivity status.

#### Scenario: Network goes offline
- **WHEN** `NetInfo` detects `isConnected === false`
- **THEN** client disconnects WebSocket (to avoid zombie connections), shows offline banner in UI, queues all outgoing messages

#### Scenario: Network comes online
- **WHEN** `NetInfo` detects `isConnected === true`
- **THEN** client reconnects WebSocket, syncs missed messages, sends queued messages, hides offline banner

### Requirement: Server Message Sync Endpoint
The NestJS backend SHALL provide a sync endpoint for offline clients.

#### Scenario: Sync endpoint
- **WHEN** client calls `GET /messages/sync?since=<ISO8601>`
- **THEN** server returns all messages with `createdAt > since` where user is a participant, ordered by `createdAt` ascending, paginated (100 per request)

#### Scenario: Sync with cursor pagination
- **WHEN** client calls `GET /messages/sync?since=<ISO8601>&cursor=<messageId>&limit=100`
- **THEN** server returns messages with `createdAt > since` AND `_id > cursor`, ordered by `createdAt` ascending, up to 100 messages
