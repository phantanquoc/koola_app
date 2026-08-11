## ADDED Requirements

### Requirement: MessageItem memo comparison accuracy

The MessageItem memoization comparator SHALL compare message reactions by value (array length and per-element userId + emoji), not by object identity.

#### Scenario: Identical reactions arrays yield memo hit

- **WHEN** two message objects have reactions arrays with identical content (same length, same userId and emoji at each index)
- **THEN** the comparator SHALL return true (messages are equal)

#### Scenario: Empty reactions arrays yield memo hit

- **WHEN** both message objects have empty reactions arrays (or both undefined)
- **THEN** the comparator SHALL return true (messages are equal)

#### Scenario: Different reaction length yields memo miss

- **WHEN** message A has 2 reactions and message B has 3 reactions
- **THEN** the comparator SHALL return false (messages are different)

#### Scenario: Swapped reactions yield memo miss

- **WHEN** message A has [userId1:👍, userId2:❤️] and message B has [userId1:❤️, userId2:👍]
- **THEN** the comparator SHALL return false (messages are different, order matters)

#### Scenario: Added reaction yields memo miss

- **WHEN** message A has [userId1:👍] and message B has [userId1:👍, userId2:❤️]
- **THEN** the comparator SHALL return false (messages are different)

#### Scenario: Removed reaction yields memo miss

- **WHEN** message A has [userId1:👍, userId2:❤️] and message B has [userId1:👍]
- **THEN** the comparator SHALL return false (messages are different)

### Requirement: Message list isolation from parent state

The message list component SHALL be wrapped in a memoization boundary that prevents re-renders when unrelated ChatScreen state changes.

#### Scenario: Typing indicator change does not re-render message list

- **WHEN** typing indicator state changes in ChatScreen (e.g., another user starts typing)
- **THEN** the message list component SHALL NOT re-render (memo boundary prevents propagation)

#### Scenario: Context menu state change does not re-render message list

- **WHEN** context menu state changes (e.g., long-press opens menu)
- **THEN** the message list component SHALL NOT re-render

#### Scenario: Network status change does not re-render message list

- **WHEN** network status indicator changes (online/offline/reconnecting)
- **THEN** the message list component SHALL NOT re-render

#### Scenario: New message invalidation triggers re-render

- **WHEN** a new message is added to the messages array (intended render trigger)
- **THEN** the message list component SHALL re-render (memo boundary allows messages prop change through)

#### Scenario: Message update invalidation triggers re-render

- **WHEN** an existing message is updated (status change, reaction added)
- **THEN** the message list component SHALL re-render

### Requirement: listViewProps stability

The listViewProps object passed to GiftedChat SHALL have a stable reference across ChatScreen re-renders.

#### Scenario: listViewProps reference unchanged on parent re-render

- **WHEN** ChatScreen re-renders due to unrelated state change
- **THEN** listViewProps reference SHALL be identical to previous render (useMemo with frozen deps)

#### Scenario: listViewProps content correct

- **WHEN** listViewProps is accessed
- **THEN** it SHALL contain initialNumToRender, maxToRenderPerBatch, windowSize, updateCellsBatchingPeriod, and removeClippedSubviews with correct values

### Requirement: Gesture handler preservation

All gesture handlers (long-press, tap, avatar tap) SHALL remain functional after memo boundary introduction.

#### Scenario: Long-press triggers context menu

- **WHEN** user long-presses a message
- **THEN** context menu SHALL open with message-specific actions (delete, copy, reply)

#### Scenario: Message tap triggers expected action

- **WHEN** user taps a message bubble
- **THEN** appropriate action SHALL occur (e.g., image preview, link navigation)

#### Scenario: Avatar tap navigates to profile

- **WHEN** user taps a sender avatar
- **THEN** navigation to sender profile SHALL occur

### Requirement: Type safety preservation

The reactions comparator and memo boundary SHALL maintain strict type safety without any type assertions or index signatures.

#### Scenario: Comparator preserves type ledger

- **WHEN** messageItemEquality.ts is type-checked
- **THEN** ComparedPropKey, UncomparedPropKey, and MustBeNever type guards SHALL pass without errors

#### Scenario: MemoizedMessageList props are strongly typed

- **WHEN** MemoizedMessageList is used in ChatScreen
- **THEN** all props SHALL have explicit types with no `any` escapes
