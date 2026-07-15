## MODIFIED Requirements

### Requirement: Account List And Create UI
The Personal (Cá nhân) tab SHALL provide a "Danh sách tài khoản" screen listing the root personal account and all owned business accounts with their verification status, and an entry point to add a new business account via a form that reuses the prior create-business UX (name, category, province, relationship type, tagline, description, address, contacts), with logo and business-license image upload through the existing media upload flow. An image SHALL be considered uploaded only after that flow returns a persistent object key; the client SHALL NOT fabricate a key or report upload success for a local-only selection.

#### Scenario: Account list shows accounts and statuses
- **WHEN** the user opens "Danh sách tài khoản"
- **THEN** the screen SHALL list the personal account and each owned business account with a label reflecting its `verificationStatus`

#### Scenario: Create business from the list
- **WHEN** the user taps "Thêm tài khoản doanh nghiệp", completes the form (including uploading a logo and a business-license image), and submits
- **THEN** the client SHALL upload the images via the media flow, call `POST /accounts/business` with the confirmed object keys, and the new account SHALL appear in the list as `pending`

#### Scenario: Selecting an account switches into it
- **WHEN** the user selects an account from the list
- **THEN** the client SHALL perform the account switch (subject to the active-call guard)

#### Scenario: License selection is cancelled
- **WHEN** the user cancels the system picker without selecting a license image
- **THEN** the UI SHALL return to its prior state without reporting success or creating a license key

#### Scenario: License upload fails
- **WHEN** selection succeeds but the media upload fails
- **THEN** the UI SHALL show an actionable failure state
- **AND** business submission SHALL remain blocked unless a previously confirmed license key still exists

#### Scenario: License upload succeeds
- **WHEN** the media upload completes and returns a persistent object key
- **THEN** the UI SHALL show the uploaded state
- **AND** the exact returned key SHALL be used as `licenseImageKey`

#### Scenario: User submits while upload is active
- **WHEN** a required license upload is still in progress
- **THEN** the submit action SHALL remain disabled
- **AND** no business creation request SHALL be sent
