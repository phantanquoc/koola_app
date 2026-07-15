## Purpose

Ensure every user-facing mobile feature exposes truthful availability state (ready, preview, or unavailable), preventing fake success feedback, fabricated platform metrics, and misleading navigation prominence for unfinished capabilities.

## Requirements

### Requirement: Mobile features expose truthful availability

Each user-facing mobile feature SHALL have a defined `ready`, `preview`, or `unavailable` state that controls both presentation and interaction.

#### Scenario: Feature is ready

- **WHEN** a feature is configured as ready
- **THEN** enabled actions SHALL invoke a real supported workflow
- **AND** success feedback SHALL reflect confirmed application state

#### Scenario: Feature is preview-only

- **WHEN** a feature uses sample data or lacks a transactional backend
- **THEN** the surface SHALL visibly identify itself as a preview before interaction
- **AND** it SHALL NOT claim that an order, booking, send, upload, or other durable operation succeeded

#### Scenario: Feature is unavailable

- **WHEN** a feature cannot provide a meaningful preview or real action
- **THEN** it SHALL not occupy a primary navigation destination
- **AND** any retained entry point SHALL be disabled or explicitly labeled as upcoming

### Requirement: Preview data cannot impersonate user state

Sample content SHALL not produce counters, badges, or state transitions that appear to be persisted user activity.

#### Scenario: User taps a preview commerce action

- **WHEN** the user taps add-to-cart, buy, request, or booking on preview data
- **THEN** the UI SHALL not increment a durable-looking counter or report success
- **AND** the UI SHALL provide a non-success preview explanation

#### Scenario: Preview screen is reopened

- **WHEN** the user leaves and reopens a preview screen
- **THEN** no fake activity SHALL be presented as previously saved user state

### Requirement: Preview data cannot impersonate platform metrics

Mock ecosystem data SHALL not present fabricated platform-level metrics that imply a verified, active marketplace.

#### Scenario: Preview surface displays platform metrics

- **WHEN** a preview Shopping or Services surface renders product/provider data
- **THEN** fabricated sold counts, star ratings, verified badges, and time-urgency promotions SHALL NOT appear as real ecosystem data
- **AND** the surface SHALL carry a visible preview/demo indicator before the user interacts with any item

#### Scenario: Preview item details are opened

- **WHEN** a user taps into a preview product or provider detail
- **THEN** the detail SHALL not present mock metrics (ratings, sold counts, reviews) as genuine platform-verified data
- **AND** a preview indicator SHALL remain visible in the detail context

### Requirement: Unavailable composer actions are clear before activation

Chat composer controls SHALL expose only supported actions as enabled controls.

#### Scenario: Voice messaging is unavailable

- **WHEN** voice-message sending is not implemented
- **THEN** the voice action SHALL be hidden or visibly unavailable with an accessible explanation
- **AND** it SHALL not appear enabled and then open a generic development alert

#### Scenario: Emoji picker is unavailable

- **WHEN** an emoji picker is not implemented
- **THEN** its composer action SHALL follow the same unavailable-action policy without blocking text sending

### Requirement: Primary navigation prioritizes ready experiences

Primary and high-frequency nested navigation SHALL not be consumed by an unfinished feature while a ready core experience is unreachable.

#### Scenario: Calls is ready and Shorts is unfinished

- **WHEN** the Chat destination set is constructed
- **THEN** Calls SHALL receive the primary destination slot
- **AND** Shorts SHALL follow its configured preview or unavailable policy
