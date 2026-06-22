## ADDED Requirements

### Requirement: Chat composer visual clarity
Chat composer UI polish SHALL preserve existing input behavior and message send semantics while making actions and states clearer.

#### Scenario: Composer is polished
- **WHEN** the chat composer layout, labels, icons, or action affordances are updated
- **THEN** the composer SHALL remain an uncontrolled text input and SHALL preserve existing send, attachment, keyboard, and safe-area behavior

#### Scenario: Composer action is unavailable
- **WHEN** a composer action is disabled, loading, or unavailable
- **THEN** the UI SHALL communicate that state visually and accessibly without blocking unrelated actions

### Requirement: Chat message state clarity
Chat UI polish SHALL make supported message states easier to understand without changing message transport or storage behavior.

#### Scenario: Existing sending or failed state is available
- **WHEN** the current message data exposes sending, queued, offline, failed, or retryable state
- **THEN** the UI SHALL present that state inline near the relevant message or composer area rather than using a blocking modal for normal network conditions

#### Scenario: State data is not available
- **WHEN** the current message data does not expose a desired visual state
- **THEN** the implementation SHALL NOT invent fake message states and SHALL defer that UX until the data contract is explicitly scoped

### Requirement: Chat navigation safety
Chat UI modernization SHALL preserve navigation behavior that prevents pop-back flicker and tab dock regressions.

#### Scenario: Chat screen is opened and closed
- **WHEN** a user opens a chat and navigates back to the chat list
- **THEN** the existing `freezeOnBlur`-protected behavior SHALL be preserved and the UI SHALL NOT reintroduce stale snapshot flicker

#### Scenario: Chat composer is changed visually
- **WHEN** chat composer visual code is updated
- **THEN** the update SHALL NOT reintroduce `BlurView` in the composer surface
