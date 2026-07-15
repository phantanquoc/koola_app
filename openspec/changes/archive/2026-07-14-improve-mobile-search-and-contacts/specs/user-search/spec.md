## ADDED Requirements

### Requirement: People-search destination describes its real scope
The mobile destination backed by `GET /users/search` SHALL describe global Koola user discovery and SHALL not imply a saved-contact list when no saved-contact model exists.

#### Scenario: User views the Chat destination row
- **WHEN** the people-search destination is visible
- **THEN** its Vietnamese label SHALL describe finding people rather than saved contacts

#### Scenario: No query has been entered
- **WHEN** the people-search screen opens with an empty query
- **THEN** the empty state SHALL explain that users can search Koola people by supported identity fields

#### Scenario: Search fails
- **WHEN** the people-search API fails
- **THEN** the screen SHALL show a recoverable error state
- **AND** it SHALL not present the failure as zero matching users

#### Scenario: Error messages are Vietnamese
- **WHEN** a people/contacts search error is displayed to the user
- **THEN** the error message SHALL be in Vietnamese
- **AND** English-only error strings (e.g. `useContactsSearch.ts:34`) SHALL be replaced with Vietnamese equivalents
