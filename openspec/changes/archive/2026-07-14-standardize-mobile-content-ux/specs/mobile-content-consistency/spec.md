## ADDED Requirements

### Requirement: Production mobile copy uses a consistent Vietnamese baseline
User-facing labels, headings, empty states, errors, and actions in production mobile surfaces SHALL use consistent Vietnamese terminology.

#### Scenario: User opens Moments
- **WHEN** the production Moments entry screen renders
- **THEN** headings and action labels SHALL use Vietnamese
- **AND** English labels such as `STORY HUB` or `Highlights` SHALL not appear unless they are an intentional proper product name

#### Scenario: A raw service error is English
- **WHEN** a user-facing operation fails with an unmapped English service message
- **THEN** the UI SHALL present a stable Vietnamese fallback
- **AND** diagnostic detail MAY remain in development logs

### Requirement: Relative time is understandable
Mobile list and search timestamps SHALL use locale-aware Vietnamese output without ambiguous unit abbreviations.

#### Scenario: Timestamp is several weeks old
- **WHEN** a list item is between one week and the calendar-date threshold
- **THEN** its timestamp SHALL use an understandable form such as `2 tuan` or an explicit date
- **AND** it SHALL not display `2tu`

#### Scenario: Timestamp is several months old
- **WHEN** a list item is several months old
- **THEN** its timestamp SHALL use an understandable month or calendar-date form
- **AND** it SHALL not display `2th`

#### Scenario: Day unit is unambiguous
- **WHEN** a list item is one or more days old
- **THEN** its timestamp SHALL NOT use `1n` which is ambiguous between days and years in Vietnamese abbreviation
- **AND** it SHALL use an explicit form such as `1 ngay` or a calendar date

#### Scenario: Hour unit is correct Vietnamese
- **WHEN** a list item is several hours old
- **THEN** its timestamp SHALL NOT display `5g` (incorrect abbreviation for `gio`)
- **AND** it SHALL use an understandable form such as `5 gio` or `5h`

#### Scenario: Calls screen timestamps include the year when needed
- **WHEN** a call history item is from a previous calendar year
- **THEN** the displayed date SHALL include the year
- **AND** it SHALL not display a day/month without year context (`CallsScreen.tsx:69`)

### Requirement: Recoverable states provide a matching action
Empty and error states SHALL expose an inline action whenever the user can directly resolve or retry the condition.

#### Scenario: Connect filters remove all results
- **WHEN** active filters produce no Connect results
- **THEN** the empty state SHALL identify the filter condition
- **AND** provide a clear-filters action

#### Scenario: Connect has no results without filters
- **WHEN** there are no results and no active filters
- **THEN** the state SHALL not instruct the user to change filters
- **AND** it SHALL offer a relevant refresh, search, create, or informational next step if available

#### Scenario: Loading fails
- **WHEN** a recoverable list request fails
- **THEN** the error state SHALL provide retry without discarding valid cached content

### Requirement: User-initiated failures are visible
An operation started by the user SHALL not fail only in diagnostic logs.

#### Scenario: Start conversation fails
- **WHEN** a user selects a person or business and conversation creation fails
- **THEN** a visible Vietnamese error SHALL explain that the action did not complete
- **AND** the user SHALL retain a safe retry path

### Requirement: Compact content remains resilient
Repeated-use mobile surfaces SHALL keep labels and content within stable responsive bounds.

#### Scenario: Vietnamese label is long
- **WHEN** a translated label exceeds its usual width
- **THEN** it SHALL wrap, truncate with an accessible full name, or grow its container without overlapping another control

#### Scenario: List content changes dynamically
- **WHEN** badges, timestamps, loading text, or error text changes
- **THEN** the surrounding row SHALL retain a coherent alignment and touch target
