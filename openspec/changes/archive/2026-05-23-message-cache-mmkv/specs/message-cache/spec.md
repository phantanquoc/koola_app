# message-cache Specification

## Purpose

Provides a synchronous, MMKV-backed cache of recent chat messages so that opening a previously-visited conversation paints messages on the first render frame after navigation, rather than showing an empty screen until the REST initial-page fetch resolves. The cache is per-conversation, capped at 50 head messages, and is wiped on logout to maintain per-account isolation.

This capability is consumed by the `useMessages` hook in ChatScreen. It does not replace the existing REST + Socket.IO pipeline — that pipeline remains the source of truth and continues to drive eventual consistency. The cache is a paint-time hint only.

> **Storage backend:** the cache reuses `react-native-mmkv@^3.3.3` already required by `media-cache-persistence`. A separate MMKV instance (`id: 'message-cache'`) namespaces the data without adding a new native dependency. Reads are mmap-backed and synchronous so they can run inside React's `useState` lazy initializer.

## Requirements

### Requirement: Synchronous First-Frame Render

The mobile app SHALL paint cached messages on the first render frame of ChatScreen for any conversation that was previously visited in this account on this device.

#### Scenario: Re-entering a previously visited conversation paints messages on frame 1

- **GIVEN** a conversation C was visited at least once before in this account
- **AND** at least one message was rendered for C during that prior session
- **WHEN** the user navigates to ChatScreen for C again
- **THEN** the first React render SHALL receive a non-empty `messages` array
- **AND** the loading state SHALL NOT be shown

#### Scenario: Visiting a brand-new conversation falls back to network

- **GIVEN** a conversation C has never been opened on this device under this account
- **WHEN** the user navigates to ChatScreen for C
- **THEN** the first render SHALL receive an empty `messages` array
- **AND** the loading state SHALL be shown until the REST initial fetch resolves
- **AND** the cache SHALL be populated from the REST result for use on subsequent visits

### Requirement: Cache Survives Process Restart

The mobile app SHALL persist cached messages across full process kills and device restarts.

#### Scenario: Cache hit after killing and relaunching the app

- **GIVEN** the cache for conversation C contains at least one message
- **WHEN** the user fully kills the app and then relaunches it
- **AND** opens conversation C
- **THEN** the first render of ChatScreen SHALL receive the previously-cached messages
- **AND** the cache SHALL remain readable until explicitly cleared

### Requirement: Bounded Cache Size

The cache SHALL be bounded per conversation to prevent unbounded growth.

#### Scenario: Cache stores at most 50 head messages per conversation

- **GIVEN** the in-memory `messages` array contains more than 50 entries
- **WHEN** `messageCacheService.write` persists the array
- **THEN** only the first 50 entries (head, newest-first) SHALL be persisted
- **AND** older entries SHALL NOT be written to MMKV

#### Scenario: Empty arrays delete the entry instead of writing []

- **GIVEN** the filtered slice for conversation C contains zero messages (e.g. all messages were optimistic and filtered out)
- **WHEN** `messageCacheService.write` runs for C
- **THEN** the MMKV entry for C SHALL be deleted
- **AND** no empty-array string SHALL be persisted

### Requirement: Optimistic Messages Are Not Persisted

The cache SHALL exclude messages that have not yet been acknowledged by the server.

#### Scenario: Pending messages are filtered on write

- **GIVEN** the in-memory `messages` array contains entries whose `_id` starts with `temp_` OR whose `pending` flag is `true`
- **WHEN** `messageCacheService.write` persists the array
- **THEN** those entries SHALL NOT be included in the persisted slice

#### Scenario: Server-acknowledged messages with stable IDs are persisted

- **WHEN** a message in the array has a non-`temp_` `_id` AND `pending` is not `true`
- **THEN** that message SHALL be eligible for persistence

### Requirement: Date Rehydration on Read

The cache SHALL preserve the runtime type of `IMessage.createdAt` across persistence.

#### Scenario: createdAt is restored as a Date instance

- **GIVEN** a cached message whose `createdAt` was a `Date` at write time
- **WHEN** `messageCacheService.read` parses and returns the entry
- **THEN** the returned message's `createdAt` SHALL be a `Date` instance
- **AND** GiftedChat SHALL be able to call `Date` methods on it without runtime errors

### Requirement: Per-Account Isolation on Logout

The cache SHALL be wiped when the user logs out so that a different account cannot see the previous user's chat history.

#### Scenario: Logout clears every cached conversation

- **WHEN** `AuthContext.logout()` runs to completion
- **THEN** `messageCacheService.clearAll()` SHALL have been invoked
- **AND** subsequent `messageCacheService.read(conversationId)` calls SHALL return an empty array for any conversation

#### Scenario: Failed remote logout still clears the cache

- **GIVEN** the network request to `authApi.logout` fails
- **WHEN** `AuthContext.logout()`'s `finally` block runs
- **THEN** `messageCacheService.clearAll()` SHALL still be invoked

### Requirement: Resilient Reads

The cache SHALL never crash the calling code, even on storage corruption.

#### Scenario: Corrupt JSON returns an empty array

- **GIVEN** the MMKV entry for conversation C contains a non-parsable string
- **WHEN** `messageCacheService.read(C)` is called
- **THEN** the call SHALL return `[]`
- **AND** the call SHALL NOT throw

#### Scenario: Cache miss returns an empty array

- **GIVEN** the MMKV entry for conversation C does not exist
- **WHEN** `messageCacheService.read(C)` is called
- **THEN** the call SHALL return `[]`
- **AND** the call SHALL NOT throw

### Requirement: Debounced Writes

Writes SHALL be coalesced so bursts of state changes (typing acknowledgments, reaction toggles, status updates) do not produce one persist per change.

#### Scenario: Multiple updates within 500 ms produce one write

- **GIVEN** the in-memory `messages` array updates three times in 200 ms
- **WHEN** the debounce window elapses
- **THEN** `messageCacheService.write` SHALL have been called exactly once
- **AND** the persisted state SHALL reflect the final array, not any intermediate one
