## ADDED Requirements

### Requirement: Calls history screen
The system SHALL provide a CallsScreen that displays the authenticated user's call history, fetched from GET /call-logs. Each entry SHALL display: remote party name and avatar, call type icon (audio or video), call status (ended, missed, declined, busy, failed), formatted duration (for ended calls), and relative timestamp.

#### Scenario: User opens Calls tab
- **WHEN** the user navigates to the Calls tab
- **THEN** CallsScreen renders a list of call log entries fetched from GET /call-logs?page=1&limit=20

#### Scenario: No call history
- **WHEN** the user has no call log records
- **THEN** CallsScreen displays an empty state message

#### Scenario: Entry display for a missed call
- **WHEN** a call log has status 'missed'
- **THEN** the entry shows a missed call indicator (e.g., red icon) with the remote party name and timestamp

#### Scenario: Entry display for a completed call
- **WHEN** a call log has status 'ended' and a non-zero duration
- **THEN** the entry shows the duration formatted as mm:ss (or h:mm:ss for calls over an hour)

### Requirement: Paginated call history loading
CallsScreen SHALL support pagination. When the user scrolls to the bottom of the list, the next page SHALL be fetched and appended. Loading state SHALL be shown during fetch.

#### Scenario: User scrolls to end of list
- **WHEN** the user reaches the end of the currently loaded call history
- **THEN** the next page is fetched and entries are appended to the list

#### Scenario: All pages loaded
- **WHEN** the last page has been fetched and no more records exist
- **THEN** no further requests are made and no loading indicator is shown

### Requirement: Call back from history
Each call history entry SHALL provide a tap action that initiates a new call of the same type to the same remote party.

#### Scenario: User taps a call history entry
- **WHEN** the user taps a call history entry
- **THEN** a new call of the same type (audio or video) is initiated to the remote party, navigating to CallScreen

#### Scenario: Remote party no longer exists
- **WHEN** the user taps a call history entry for a deleted or unavailable user
- **THEN** an appropriate error message is shown and no call is initiated
