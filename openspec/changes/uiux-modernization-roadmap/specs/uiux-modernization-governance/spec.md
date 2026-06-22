## ADDED Requirements

### Requirement: Incremental UI/UX batch governance
UI/UX modernization work SHALL be delivered in small batches with a declared scope, declared non-scope, risk level, changed files, verification step, and review checkpoint.

#### Scenario: Batch starts with declared scope
- **WHEN** an implementation batch begins
- **THEN** the batch SHALL identify the files or feature area it intends to change and the files or feature areas it will not change

#### Scenario: Batch ends with verification result
- **WHEN** an implementation batch finishes
- **THEN** the batch SHALL report changed files, summarize the UI/UX effect, and report the verification command result or explain why verification was skipped

#### Scenario: User-visible batch pauses for review
- **WHEN** a batch changes a user-visible surface
- **THEN** the implementation SHALL pause after reporting results so the user can review before the next user-visible batch proceeds

### Requirement: Safe rollback boundaries
Each UI/UX batch SHALL avoid mixing unrelated subsystems so that a regression can be reverted by reverting only the batch that introduced it.

#### Scenario: Mobile foundation batch avoids feature logic
- **WHEN** a batch is scoped to mobile UI primitives
- **THEN** it SHALL NOT change chat synchronization, Moments service semantics, backend APIs, navigation route contracts, or admin workflows

#### Scenario: Moments entry batch avoids media lifecycle
- **WHEN** a batch is scoped to Moments feed or ring presentation
- **THEN** it SHALL NOT change story media playback, audio preview lifecycle, story creation API behavior, or viewer timer semantics

#### Scenario: Chat UI batch avoids message transport changes
- **WHEN** a batch is scoped to chat visual clarity
- **THEN** it SHALL NOT change REST message sending semantics, socket event contracts, offline queue semantics, or local message store behavior

### Requirement: Dependency approval gate
New visual dependencies SHALL require explicit batch-level approval before being added.

#### Scenario: Dependency is proposed
- **WHEN** implementation would benefit from a new SVG, icon, chart, haptic, animation, or UI framework dependency
- **THEN** the batch SHALL state the dependency, purpose, alternatives, risk, and obtain approval before changing package files
