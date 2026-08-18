# inline-call-cards Specification

## Purpose
TBD - created by archiving change inline-call-cards-in-chat. Update Purpose after archive.
## Requirements
### Requirement: Inline call cards in chat timeline
The system SHALL render call history as cards inline inside ChatScreen's message timeline, merged chronologically with text/media messages. Each card SHALL show call direction/status, duration (for ended calls), relative timestamp, and a "GỌI LẠI" action that initiates a new call of the same type to the same remote party.

#### Scenario: Direct conversation shows inline call cards
- **WHEN** a direct conversation has call log entries
- **THEN** ChatScreen fetches `GET /call-logs?conversationId=<id>&limit=50` and merges entries with messages by timestamp (newest-first) so cards appear interleaved like Zalo (e.g., "Cuộc gọi video đi 22 phút 1 giây", "Bạn bị nhỡ Cuộc gọi video", "Cuộc gọi thoại đến 0 phút 59 giây")

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

#### Scenario: No inline cards when no history
- **WHEN** the conversation has zero call logs
- **THEN** no cards are added and the timeline shows only messages

#### Scenario: Group conversation inline cards
- **WHEN** a group conversation has call logs
- **THEN** cards are still rendered but "GỌI LẠI" for group shows toast "Gọi nhóm đang phát triển" (matching existing group-call guard)
