## MODIFIED Requirements

### Requirement: Per-conversation call history sheet
The system SHALL provide a per-conversation call history sheet that displays only call log entries for the selected conversation. The sheet SHALL be opened from GroupInfoScreen (group) or ProfileScreen (direct) via a "Lịch sử cuộc gọi" entry, and SHALL fetch via `GET /call-logs?conversationId=<id>`. In addition to the sheet, the same per-conversation history SHALL also be visible inline inside ChatScreen (inline-call-cards), merged with messages. The sheet remains available as a secondary, filtered view.

#### Scenario: User opens history from group info
- **WHEN** the user taps "Lịch sử cuộc gọi" in GroupInfoScreen
- **THEN** a BottomSheet opens and fetches `GET /call-logs?conversationId=<conversationId>&page=1&limit=20`

#### Scenario: User opens history from profile (direct)
- **WHEN** the user taps "Lịch sử cuộc gọi" in ProfileScreen for a direct conversation
- **THEN** the same BottomSheet opens filtered to that conversationId

#### Scenario: Empty per-conversation history
- **WHEN** the conversation has no call log records
- **THEN** the sheet displays an empty state "Chưa có cuộc gọi nào trong cuộc trò chuyện này"

#### Scenario: Per-conversation history entry display
- **WHEN** a call log entry is rendered in the sheet
- **THEN** it shows remote party avatar/name, call type icon (audio/video), status indicator (ended/missed/declined/busy/failed), formatted duration for ended calls, and relative timestamp — same as the former global CallsScreen

#### Scenario: Paginated per-conversation history
- **WHEN** the user scrolls to the end of the sheet list
- **THEN** the next page is fetched with `conversationId` preserved and appended

#### Scenario: Call back from per-conversation history
- **WHEN** the user taps an entry in the per-conversation sheet
- **THEN** a new call of the same type is initiated to the same remote party via `webrtcService.initiateCall`, reusing the existing `useCallInitiation` / `CallsScreen.handleCallBack` flow

#### Scenario: Sheet closed
- **WHEN** the user drags down or taps outside the sheet
- **THEN** the sheet dismisses without side effects

#### Scenario: Inline history also visible in chat
- **WHEN** the user opens ChatScreen for a conversation with call history
- **THEN** the same entries are also visible inline as cards interleaved with messages (per inline-call-cards), so the user does not need to open the sheet to see recent calls
