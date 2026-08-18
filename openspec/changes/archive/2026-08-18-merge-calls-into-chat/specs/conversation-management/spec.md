## ADDED Requirements

### Requirement: Quick-call from conversation list
The conversation list SHALL show a quick-call affordance (phone icon, 36dp) on direct (1:1) conversation rows. Tapping it SHALL initiate an audio call to the other participant without navigating into the chat. Group rows SHALL NOT show the quick-call button.

#### Scenario: Direct conversation shows call button
- **WHEN** a direct conversation row is rendered
- **THEN** a phone icon button (36dp, primary color, accessibilityLabel "Gọi") is visible at the trailing edge of the row

#### Scenario: Group conversation hides call button
- **WHEN** a group conversation row is rendered
- **THEN** no quick-call button is shown

#### Scenario: User taps quick-call on direct row
- **WHEN** the user taps the phone icon on a direct row and the WebRTC socket is connected
- **THEN** `webrtcService.initiateCall(otherUserId, conversationId, 'audio')` is invoked and the usual `call_initiated` → `CallModal` flow runs

#### Scenario: Quick-call when offline
- **WHEN** the user taps quick-call while `webrtcService.isConnected()` is false
- **THEN** an Alert "Chưa kết nối, vui lòng thử lại." is shown and no call is initiated

#### Scenario: Quick-call resolves correct callee
- **WHEN** the quick-call handler resolves the other participant
- **THEN** it uses the same `resolveConversationHeader` / `members.find(userId !== currentUserId)` logic as the row header, and shows "Không xác định được người nhận" if none found
