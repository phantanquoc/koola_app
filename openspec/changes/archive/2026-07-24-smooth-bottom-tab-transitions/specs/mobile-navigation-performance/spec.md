## ADDED Requirements

### Requirement: First-mount tab screens paint an interactive shell immediately

Primary bottom-tab screens whose first render is heavy (Shopping, Connect) SHALL paint an interactive shell — chrome plus skeleton placeholders using the existing `KoolaSkeleton` primitive — on the first frame after the tab transition, and SHALL defer construction of the heavy content tree until after the navigation transition completes using the existing `InteractionManager.runAfterInteractions` defer pattern.

#### Scenario: User opens a heavy tab for the first time
- **WHEN** a user taps Shopping or Connect and that screen mounts for the first time in the session
- **THEN** an interactive shell (header plus skeleton placeholders) SHALL be visible on the first frame
- **AND** the heavy content tree (product/business list) SHALL be constructed after the transition settles
- **AND** the deferred work SHALL be cancelled if the screen unmounts before it runs

#### Scenario: Deferred content replaces the skeleton
- **WHEN** the deferred content tree finishes constructing
- **THEN** the skeleton placeholders SHALL be replaced by the real content in place
- **AND** no white flash or full-screen blank SHALL appear between shell and content

#### Scenario: Revisiting a tab does not regress
- **WHEN** a user returns to a tab that has already mounted this session
- **THEN** the revisit transition SHALL NOT be slower than before this change
- **AND** the shell/defer path SHALL NOT introduce an extra skeleton flash on an already-populated screen

### Requirement: Focus-time work does not block first list paint

Screen focus handlers SHALL NOT perform blocking asynchronous work before the primary list becomes interactive. Specifically, avatar cache warming in `ConversationListScreen` SHALL run after the conversation list is rendered and interactive, not as an awaited gate before first paint.

#### Scenario: Returning to Chat home warms avatars without blocking
- **WHEN** a user navigates back to the Chat home and the conversation list data is available
- **THEN** the conversation list SHALL render without waiting for avatar cache warming to complete
- **AND** avatar cache warming SHALL run after the list is interactive
- **AND** avatars SHALL still populate from cache once warming completes

#### Scenario: Cache warming failure does not break the list
- **WHEN** avatar cache warming throws or rejects
- **THEN** the conversation list SHALL remain rendered and interactive
- **AND** the error SHALL NOT propagate to block the focus handler

### Requirement: Transition-frame animation cost on first mount is bounded

Header logo entrance animation on commerce tabs MAY be suppressed on first mount where it competes with heavy list construction, rendering the logo in its final static state instead. This SHALL NOT alter the Chat home logo replay behavior.

#### Scenario: Commerce tab first mount avoids competing animation
- **WHEN** a commerce tab (Shopping) mounts for the first time with a heavy list
- **THEN** the header logo MAY render in its final static state without an entrance animation on that first frame
- **AND** the Chat home logo replay behavior SHALL remain unchanged

### Requirement: Bottom-tab transition smoothness is measured against a baseline

Bottom-tab transition performance SHALL be verified with the adb `gfxinfo` framestats method after implementation. The worst-case first-mount transition (Chat → Shopping FIRST) SHALL improve meaningfully versus the recorded baseline, and revisit transitions SHALL NOT regress.

#### Scenario: Post-change measurement meets the gate
- **WHEN** the app is cold-started on device and each transition is measured with `dumpsys gfxinfo com.chatapp reset`, an `input tap` on the target tab, a fixed 1.0s window, then framestats readout
- **THEN** Chat → Shopping FIRST p99 SHALL drop meaningfully below the 133ms baseline
- **AND** no previously-passing revisit transition SHALL regress in janky-frame count or p99
