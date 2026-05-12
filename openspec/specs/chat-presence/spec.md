# chat-presence Specification

## Purpose
Displays the online/offline status and last-seen time of the other participant in 1-1 chat conversations. Group conversations are out of scope for per-user presence in the header.

## Requirements
### Requirement: Display online status in 1-1 chat header
The mobile client SHALL display the other participant's online status and last-seen time in the ChatScreen header when the conversation type is direct (1-1). Group conversations SHALL NOT show per-user presence in the header for this change.

#### Scenario: Partner is currently online
- **WHEN** the other user's presence state is online (last `presence_update` for them was `{ isOnline: true }` or they are within the active session window)
- **THEN** the header shows a small green dot on the partner's avatar and a subtitle text "Dang hoat dong"

#### Scenario: Partner went offline recently
- **WHEN** the other user has been offline for less than 1 hour
- **THEN** the header shows no green dot and a subtitle "Hoat dong X phut truoc" with minutes computed from the lastSeen timestamp

#### Scenario: Partner offline for a long time
- **WHEN** the other user's lastSeen is more than 24 hours ago, or is unknown
- **THEN** the header shows no green dot and no subtitle (or shows a neutral empty subtitle); no error is thrown

#### Scenario: Group conversation
- **WHEN** `conversation.type === 'group'`
- **THEN** ChatScreen SHALL NOT subscribe to `presence_update` for any member; the header shows the member count instead

### Requirement: Subscribe to presence_update socket event
The mobile client SHALL subscribe to `presence_update` events in ChatScreen for 1-1 conversations and update local presence state for the other participant only.

#### Scenario: Subscribe on mount
- **WHEN** ChatScreen mounts for a direct conversation
- **THEN** client registers a `presence_update` listener filtered by the other participant's userId

#### Scenario: Unsubscribe on unmount
- **WHEN** ChatScreen unmounts
- **THEN** client removes the `presence_update` listener it registered (no leak across screens)

#### Scenario: Ignore presence updates for unrelated users
- **WHEN** a `presence_update` event is received with `userId !== otherUserId`
- **THEN** the listener does nothing (header state unchanged)

