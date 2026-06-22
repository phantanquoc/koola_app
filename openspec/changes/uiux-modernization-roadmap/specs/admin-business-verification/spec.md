## ADDED Requirements

### Requirement: Business verification trust UX clarity
Admin business verification UI SHALL help operators distinguish pending, verified, rejected, and risky review states without relying on color alone.

#### Scenario: Business queue row is shown
- **WHEN** a pending business appears in the admin verification queue
- **THEN** the row SHALL show the business identity, submitter context, verification status, and available review actions clearly

#### Scenario: Verification status is displayed
- **WHEN** a business verification state is displayed
- **THEN** the UI SHALL pair color with text or iconography so the state remains understandable without color perception

### Requirement: Reject reason clarity
Business verification rejection UI SHALL make reject reasons explicit, reviewable, and recoverable before submission.

#### Scenario: Operator rejects a business
- **WHEN** an admin starts a reject action
- **THEN** the UI SHALL present a reason field or reason template flow before submitting the rejection

#### Scenario: Rejection reason is missing
- **WHEN** an admin attempts to submit a rejection without a required reason
- **THEN** the UI SHALL prevent submission and present an inline error explaining what is needed

### Requirement: Business verification actions preserve API semantics
Visual improvements to business verification SHALL preserve existing authorization and verification API semantics.

#### Scenario: Business approval UI is polished
- **WHEN** approve or reject controls are redesigned
- **THEN** the controls SHALL continue to call the existing approved/rejected business verification operations with the same required data semantics

#### Scenario: Action is pending
- **WHEN** an approve or reject request is in progress
- **THEN** the UI SHALL prevent accidental duplicate submission and show a clear pending state for the action
