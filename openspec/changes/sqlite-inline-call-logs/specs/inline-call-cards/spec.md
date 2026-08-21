## MODIFIED Requirements

### Requirement: Inline call cards in chat timeline

The system SHALL render call history as cards inline inside ChatScreen's message timeline, merged chronologically with text/media messages. Each card SHALL show call direction/status, duration (for ended calls), relative timestamp, and a "GỌI LẠI" action that initiates a new call of the same type to the same remote party. The inline history SHALL be read from the local SQLite `call_logs` store on the hot path so it appears on the first frame; network fetches SHALL occur only off the critical path as background sync, and realtime call termination SHALL be reflected via socket→SQLite without a REST refetch.

#### Scenario: Direct conversation shows inline call cards

- **WHEN** a direct conversation has call log entries already in the local `call_logs` table
- **THEN** ChatScreen reads `callLogRepository.list({ conversationId, limit: 50 })` synchronously on mount and merges entries with messages by timestamp (newest-first) so cards appear interleaved like Zalo (e.g., "Cuộc gọi video đi 22 phút 1 giây", "Bạn bị nhỡ Cuộc gọi video", "Cuộc gọi thoại đến 0 phút 59 giây")
- **AND** no `GET /call-logs` request SHALL be made before the first paint

#### Scenario: Initial open triggers background sync

- **WHEN** a conversation is opened and its `call_logs` rows are stale or empty per the sync freshness window
- **THEN** a background `syncCallLogsOnOpen(conversationId)` SHALL paginate `GET /call-logs?conversationId=<id>` off the critical path, upsert into SQLite, and notify subscribers so cards appear incrementally without a full refetch or pop-in

#### Scenario: Realtime call termination appears without refetch

- **WHEN** a call terminates (status `ended`/`missed`/`declined`/`busy`/`failed`/`cancelled`/`answered`) while the user is inside the conversation and the backend emits the corresponding socket event to `conv:<id>`
- **THEN** `socketEventRouter` SHALL upsert the payload into `call_logs` via `callLogRepository.upsertMany` and the inline timeline SHALL update via subscription within one frame
- **AND** no `GET /call-logs` refetch SHALL be required for the new card to appear

#### Scenario: Cursor pagination reads from SQLite

- **WHEN** the inline timeline has more than one page of call logs
- **THEN** loading older inline history SHALL be performed via `callLogRepository.listBefore({ before: oldestStartedAt })` (SQLite cursor), not via paginated REST

#### Scenario: Missed call card styling

- **WHEN** a call log status is `missed` and the user was the callee
- **THEN** the card shows "Bạn bị nhỡ" in red, a missed icon, and "GỌI LẠI" button

#### Scenario: Ended call card shows duration

- **WHEN** a call log status is `ended` with duration > 0
- **THEN** the card shows formatted duration (mm:ss, or h:mm:ss) alongside status and timestamp

#### Scenario: Tap GỌI LẠI on inline card

- **WHEN** the user taps "GỌI LẠI" on an inline card and WebRTC is connected
- **THEN** `webrtcService.initiateCall(otherUserId, conversationId, card.callType)` is invoked and the call flows to `CallModal` as with quick-call/sheet

#### Scenario: Inline card when offline

- **WHEN** the user taps "GỌI LẠI" while `webrtcService.isConnected()` is false
- **THEN** an Alert "Chưa kết nối, vui lòng thử lại." is shown and no call is initiated

#### Scenario: Offline read still shows cached inline cards

- **WHEN** the device is offline and the user opens a conversation whose `call_logs` rows were previously synced
- **THEN** the inline cards SHALL still be rendered from SQLite without requiring network

#### Scenario: No inline cards when no history

- **WHEN** the conversation has zero call logs in the local store and background sync returns empty
- **THEN** no cards are added and the timeline shows only messages

#### Scenario: Group conversation inline cards

- **WHEN** a group conversation has call logs
- **THEN** cards are still rendered but "GỌI LẠI" for group shows toast "Gọi nhóm đang phát triển" (matching existing group-call guard)
