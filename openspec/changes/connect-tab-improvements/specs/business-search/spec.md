## ADDED Requirements

### Requirement: Business search screen exists and is reachable
The system SHALL provide a dedicated `BusinessSearchScreen` accessible from the Connect tab header's search bar. Tapping the search bar in `ConnectHomeScreen` SHALL navigate to `BusinessSearchScreen`.

#### Scenario: User taps search bar
- **WHEN** the user taps the search bar in the Connect tab header
- **THEN** the app navigates to `BusinessSearchScreen` within the ConnectTabStack

#### Scenario: BusinessSearch route is registered
- **WHEN** `ConnectTabStackParamList` is inspected
- **THEN** it contains a `BusinessSearch` route with no required params

### Requirement: Full-text business search with debounce
The system SHALL query `GET /api/businesses?q=<term>` when the user types in the search input, with a debounce of 400ms. Queries shorter than 2 characters SHALL NOT trigger an API call.

#### Scenario: User types a search term
- **WHEN** the user types a term of 2 or more characters and 400ms elapses
- **THEN** `businessesApi.list({ q: term })` is called and results are rendered in a FlatList using `BusinessCard`

#### Scenario: Query shorter than 2 characters
- **WHEN** the user types fewer than 2 characters
- **THEN** no API call is made and the list is empty or shows a prompt

#### Scenario: No results found
- **WHEN** the API returns an empty `items` array
- **THEN** `EmptyConnect` (or equivalent empty state) is displayed

### Requirement: Search results use existing BusinessCard component
The search results list SHALL render each result using the same `BusinessCard` component used in `ConnectHomeScreen`, supporting the same "Xem hồ sơ" and "Kết nối ngay"/"Nhắn tin" interactions.

#### Scenario: Result card taps navigate to BusinessProfileScreen
- **WHEN** the user taps "Xem hồ sơ" on a search result card
- **THEN** the app navigates to `BusinessProfileScreen` for that business

### Requirement: Vietnamese text is correct in search screen
The search input placeholder SHALL display "Tìm doanh nghiệp..." with correct Vietnamese diacritics.

#### Scenario: Search input placeholder
- **WHEN** `BusinessSearchScreen` is rendered with no text entered
- **THEN** the placeholder reads "Tìm doanh nghiệp..."
