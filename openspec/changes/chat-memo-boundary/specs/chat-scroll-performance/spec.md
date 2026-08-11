## ADDED Requirements

### Requirement: UI-layer render optimization

The chat message list SHALL implement UI-layer optimizations (memoization boundary and comparator fixes) to prevent unnecessary re-renders during scroll and realtime updates.

#### Scenario: Parent state change does not trigger message list re-render

- **WHEN** ChatScreen state changes (typing indicator, context menu, network status) without messages array changing
- **THEN** the message list SHALL NOT re-render (memoization boundary isolates GiftedChat from parent)

#### Scenario: Reactions comparator prevents false re-renders

- **WHEN** messageRepository invalidation creates new reaction array objects with identical content
- **THEN** MessageItem components with unchanged reactions SHALL NOT re-render (value comparison, not identity)

#### Scenario: Combined optimizations reduce janky frames

- **WHEN** scroll occurs during realtime updates (socket events, typing indicators)
- **THEN** janky frame percentage SHALL be ≤8% on debug build (combined with Phase B view tree + Phase C incremental invalidation)

#### Scenario: Scroll performance maintained during high-frequency updates

- **WHEN** multiple socket events (reactions, typing, presence) occur during active scroll
- **THEN** scroll SHALL remain smooth with no visible stutter (memo boundary prevents cascade)
