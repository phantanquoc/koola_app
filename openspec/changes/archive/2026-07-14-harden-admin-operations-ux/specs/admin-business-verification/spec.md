## ADDED Requirements

### Requirement: Verification queue supports efficient discovery
The pending business queue SHALL provide sufficient search, filter, and pagination controls for a reviewer to locate and resume work.

#### Scenario: Reviewer filters the queue
- **WHEN** the reviewer applies supported text, category, province, or status criteria
- **THEN** the queue SHALL show matching records and an explicit active-filter state
- **AND** filters SHALL remain stable while opening and closing a review

#### Scenario: No businesses match
- **WHEN** filters produce no records
- **THEN** the queue SHALL show an empty state with a clear-filters action

### Requirement: License evidence remains in review context
The verification workflow SHALL allow the reviewer to inspect available license evidence without losing the target business and queue context.

#### Scenario: Reviewer opens license evidence
- **WHEN** a pending business has a `licenseImageUrl`
- **THEN** the review workspace SHALL show an in-context preview with an option to inspect the original safely
- **AND** returning from inspection SHALL preserve queue position and filters

#### Scenario: License evidence is missing or expired
- **WHEN** the evidence URL is null, expired, or fails to load
- **THEN** the review workspace SHALL state the condition and expose an allowed refresh/recovery action
- **AND** it SHALL not present a broken image as valid evidence

### Requirement: Verification decisions are explicit
Approve and reject actions SHALL present a clear decision lifecycle and SHALL not silently remove the business before the reviewer sees confirmed completion.

#### Scenario: Reviewer approves a business
- **WHEN** the reviewer chooses approve
- **THEN** the UI SHALL identify the business and require an explicit confirmation
- **AND** after server success, show completion feedback before or while updating the queue

#### Scenario: Approve requires confirmation dialog
- **WHEN** the reviewer clicks the approve button
- **THEN** a confirmation dialog SHALL appear before the API call is made
- **AND** the approve action SHALL NOT fire immediately without user confirmation (defect: `BusinessesPage.tsx:77-88` `handleApprove` calls API on click without confirm)

#### Scenario: Reviewer rejects a business
- **WHEN** the reviewer chooses reject
- **THEN** a bounded non-empty reason SHALL remain required
- **AND** duplicate submission SHALL be disabled while pending

#### Scenario: Verification request fails
- **WHEN** approve or reject fails
- **THEN** the review context, evidence, and rejection reason SHALL remain available
- **AND** the reviewer SHALL receive an actionable error
