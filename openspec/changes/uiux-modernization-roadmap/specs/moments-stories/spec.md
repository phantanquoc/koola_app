## ADDED Requirements

### Requirement: Moments entry state presentation
The Moments tab SHALL present loading, error, empty, and populated states with clear Vietnamese copy and direct recovery or creation actions where appropriate.

#### Scenario: Initial feed is loading
- **WHEN** the Moments feed is loading and no feed rings are available
- **THEN** the screen SHALL present a loading state that identifies Moments content is being synchronized

#### Scenario: Feed fails before content is available
- **WHEN** the Moments feed has an error and no feed rings are available
- **THEN** the screen SHALL present an error state with the error or a fallback recovery message and a retry action

#### Scenario: Feed is empty
- **WHEN** the Moments feed is not loading and has no own ring or friend rings
- **THEN** the screen SHALL present an empty state that explains the user can create a Moment and provides a creation action

#### Scenario: No friend Moments are available
- **WHEN** the user can see their own ring but no friend rings are available
- **THEN** the screen SHALL present a non-blocking friend-empty card with a creation action and refresh guidance

### Requirement: Moments entry header clarity
The Moments tab SHALL make the surface purpose and current feed summary understandable without requiring the user to inspect rings individually.

#### Scenario: Friend Moments are available
- **WHEN** the Moments feed contains friend rings
- **THEN** the header SHALL show a feed summary that includes the number of new friend Moments and the number of friends sharing

#### Scenario: No friend Moments are available
- **WHEN** the Moments feed contains no friend rings
- **THEN** the header SHALL invite the user to share a photo, video, or song for the day

### Requirement: Moment ring state clarity
Moment rings SHALL visually and accessibly distinguish own story, add-story affordance, unseen stories, and already-seen stories.

#### Scenario: User has no own story
- **WHEN** the own ring has no latest story identifier
- **THEN** tapping the own ring SHALL open the Moment composer rather than opening an empty viewer

#### Scenario: Ring has unviewed stories
- **WHEN** a ring represents an author with unviewed stories
- **THEN** the ring SHALL expose an accessible label that identifies the author and indicates there is a new Moment

#### Scenario: Ring has already-seen stories
- **WHEN** a ring represents an author whose stories are already seen
- **THEN** the ring SHALL expose an accessible label that identifies the author and indicates the Moment has been seen

### Requirement: Moments viewer polish preserves lifecycle
Viewer visual polish SHALL preserve existing story playback, pause, progress, close, and media lifecycle semantics.

#### Scenario: Viewer controls are visually polished
- **WHEN** viewer controls, safe area, loading state, or error state are updated
- **THEN** hold-to-pause, tap navigation, progress advancement, close behavior, view recording, and media stop-on-dismiss behavior SHALL continue to work as before

### Requirement: Moments composer polish preserves creation semantics
Composer visual polish SHALL preserve existing story creation validation and API semantics.

#### Scenario: Composer flow is visually reorganized
- **WHEN** media, caption, audience, music, or publish controls are visually polished
- **THEN** the composer SHALL still enforce existing story creation constraints and submit the same supported DTO shape to the existing story creation API
