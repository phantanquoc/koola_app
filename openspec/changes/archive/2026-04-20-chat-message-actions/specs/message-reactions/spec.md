## ADDED Requirements

### Requirement: User can add emoji reaction to a message
The system SHALL allow any conversation member to add one of 6 fixed emoji reactions (👍❤️😆😮😢😠) to any message. Each user can have at most one reaction per message. Adding the same emoji again SHALL remove it (toggle). Adding a different emoji SHALL replace the previous one.

#### Scenario: Add reaction
- **WHEN** user taps an emoji on a message that they have not reacted to
- **THEN** the reaction is saved with userId and emoji, broadcast via `message_reaction` socket event to all conversation members, and displayed under the message bubble

#### Scenario: Toggle off reaction
- **WHEN** user taps the same emoji they already reacted with
- **THEN** the reaction is removed, broadcast via socket, and the emoji disappears from the display

#### Scenario: Change reaction
- **WHEN** user taps a different emoji than their current reaction
- **THEN** the old reaction is replaced with the new one, broadcast via socket

### Requirement: Reactions displayed under message bubble
The system SHALL display reactions below each message bubble as a row of emoji with count (e.g., "👍2 ❤️1"). If no reactions exist, nothing is displayed.

#### Scenario: Multiple users react
- **WHEN** 3 users react with 👍 and 1 user reacts with ❤️
- **THEN** the display shows "👍3 ❤️1" below the message bubble

#### Scenario: No reactions
- **WHEN** a message has no reactions
- **THEN** no reaction row is displayed
