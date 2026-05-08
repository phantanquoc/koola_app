## ADDED Requirements

### Requirement: Create business form is reachable via the "+" button
The system SHALL navigate to `CreateBusinessScreen` when the user taps the "+" button in the Connect tab header. The route SHALL be registered in `ConnectTabStackParamList` as `CreateBusiness` with no required params.

#### Scenario: User taps the "+" button
- **WHEN** the user taps the "+" button in `ConnectHomeScreen`'s KoolaHeader
- **THEN** the app navigates to `CreateBusinessScreen`

#### Scenario: CreateBusiness route is registered
- **WHEN** `ConnectTabStackParamList` is inspected
- **THEN** it contains a `CreateBusiness` route

### Requirement: Create business form collects required and optional fields
`CreateBusinessScreen` SHALL present a scrollable form with the following fields matching `CreateBusinessDto`:

**Required:**
- `name` — text input, 2–100 characters
- `relationshipType` — picker with options "Đối tác" (`partner`) and "Nhà cung cấp" (`supplier`)
- `category` — picker populated from `BUSINESS_CATEGORIES` (excluding the `all` slug)
- `province` — text input

**Optional:**
- `tagline` — text input, max 120 characters
- `description` — multiline text input, max 1000 characters
- `address` — text input
- `website` — text input
- `contactEmail` — text input, keyboard type `email-address`
- `contactPhone` — text input, keyboard type `phone-pad`

Logo upload SHALL be omitted; a placeholder icon SHALL be shown in its place.

#### Scenario: Required fields validated before submission
- **WHEN** the user taps "Đăng ký" with any required field empty
- **THEN** the form displays an inline error for each missing required field and does NOT call the API

#### Scenario: Name length validated
- **WHEN** the user enters a name shorter than 2 characters and taps "Đăng ký"
- **THEN** an error is displayed: "Tên phải từ 2 ký tự trở lên"

### Requirement: Form submission creates a business via POST /api/businesses with isActive false
The system SHALL POST the form data to `/api/businesses`. The backend SHALL set `isActive: false` on all new businesses created via this endpoint, regardless of the submitted DTO.

#### Scenario: Successful submission
- **WHEN** all required fields are valid and the user taps "Đăng ký"
- **THEN** a loading indicator is shown, `POST /api/businesses` is called, and on success the screen shows: "Đã gửi yêu cầu đăng ký doanh nghiệp. Vui lòng chờ admin duyệt."

#### Scenario: New business is not visible in the public listing
- **WHEN** a new business is created via `POST /api/businesses`
- **THEN** `GET /api/businesses` does NOT include that business (because `isActive: false` and listing query filters `{ isActive: true }`)

#### Scenario: API error during submission
- **WHEN** the API call fails
- **THEN** the loading indicator is dismissed and an error message is displayed inline; the form data is preserved

### Requirement: Post-submission navigation
After a successful submission, the system SHALL navigate back to `ConnectHomeScreen`.

#### Scenario: Navigate back after success
- **WHEN** the success message is shown
- **THEN** after a brief display (or immediately on user acknowledgement), the app calls `navigation.goBack()` to return to `ConnectHomeScreen`

### Requirement: Form screen header title uses correct Vietnamese
The `CreateBusinessScreen` header title SHALL be "Đăng ký doanh nghiệp" with correct diacritics.

#### Scenario: Screen header text
- **WHEN** `CreateBusinessScreen` is rendered
- **THEN** the navigation header displays "Đăng ký doanh nghiệp"
