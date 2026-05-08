## ADDED Requirements

### Requirement: User Search Results in Universal Search Screen
The system SHALL surface `GET /users/search?q=` results inside `UniversalSearchScreen` in addition to the existing contacts tab search, reusing the same API and existing `usersApi.searchUsers()` client method.

#### Scenario: Search from UniversalSearchScreen calls existing users API
- **WHEN** user types 2+ characters in the UniversalSearchScreen text input
- **THEN** client calls `usersApi.searchUsers(query)` (same `GET /users/search?q=` endpoint used by ContactsScreen)
- **AND** results appear in the "Liên hệ" section of UniversalSearchScreen

#### Scenario: No duplication of API calls
- **WHEN** user is on UniversalSearchScreen
- **THEN** the ContactsScreen search bar is NOT active and does NOT make concurrent API calls for the same query

#### Scenario: Existing contacts tab search is unchanged
- **WHEN** user is on the Contacts sub-tab of ChatHomeScreen (not the UniversalSearchScreen)
- **THEN** the existing `ContactSearchBar.tsx` + `useContactsSearch.ts` flow is preserved exactly as before
