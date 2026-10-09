# connect-discovery Specification

## Purpose
TBD - created by archiving change business-account-switching. Update Purpose after archive.
## Requirements
### Requirement: Discovery Lists Verified Business Accounts
The Kết nối discovery surface SHALL list `User` documents where `accountType = 'business'`, `verificationStatus = 'verified'`, and `isBanned = false`. Accounts that are `pending`, `rejected`, or `banned` SHALL NOT appear.

#### Scenario: Only verified businesses listed
- **WHEN** the discovery list is requested
- **THEN** the response SHALL include only business accounts that are verified and not banned

#### Scenario: Pending business excluded
- **WHEN** a business account is `pending` or `rejected`
- **THEN** it SHALL NOT appear in the discovery list

### Requirement: Discovery Filters Preserved
The discovery surface SHALL preserve the existing filtering and navigation: relationship sub-menu items (`partner` / `supplier` via `relationshipType`), province filter, category filter (`businessCategory`), sort, and text search by business name.

The relationship items SHALL be labelled `Tất cả`, `Yêu cầu mua` (slug `partner`), and `Yêu cầu bán` (slug `supplier`). These display labels SHALL come from a single shared label map, and every surface that renders a business's `relationshipType` SHALL read from that same map so the field never displays two different names for the same value. The underlying slugs and the backend `relationshipType` enum SHALL remain `'partner' | 'supplier'`.

When a relationship filter other than `all` is active, businesses that carry no `relationshipType` SHALL be excluded from the displayed list. This SHALL hold for both API-supplied and mock-supplied businesses.

#### Scenario: Filter by relationship type
- **WHEN** the user selects the "Yêu cầu mua" sub-menu item
- **THEN** the list SHALL contain only verified business accounts with `relationshipType: 'partner'`

#### Scenario: Business without a relationship is excluded when filtering
- **WHEN** a relationship filter other than `all` is active and a business has no `relationshipType`
- **THEN** that business SHALL NOT appear in the displayed list

#### Scenario: Filter by province and category
- **WHEN** the user applies a province and a category filter
- **THEN** the list SHALL contain only verified business accounts matching both filters

#### Scenario: Search by name
- **WHEN** the user searches a business name substring
- **THEN** the list SHALL contain matching verified business accounts

#### Scenario: Relationship label is consistent across surfaces
- **WHEN** a business has `relationshipType: 'supplier'`
- **THEN** every surface that renders its relationship name SHALL display `Yêu cầu bán`

### Requirement: Direct Messaging With The Business Identity
Card actions in the discovery surface ("Nhắn tin" / "Kết nối") SHALL open a direct conversation with the business account id itself (not with a human owner), using the existing direct-conversation flow.

#### Scenario: Message a business opens chat with the business
- **WHEN** the user taps "Nhắn tin" on a verified business card
- **THEN** the client SHALL create or reuse a direct conversation whose other member is the business account id and navigate to that chat

#### Scenario: Old chat-with-owner behavior removed
- **WHEN** a user interacts with a business in discovery
- **THEN** the system SHALL NOT route the conversation to the business's owner user; the conversation participant SHALL be the business account itself

### Requirement: Aggregated Notifications With Per-Account Routing
The system SHALL deliver notifications for all accounts a device's root owns through a single device FCM token, including `accountId` and `accountType` in the push payload. The client SHALL badge notifications per account and, on tap of a notification for a non-active account, SHALL switch into that account before navigating to the target screen.

#### Scenario: Notification payload carries account context
- **WHEN** the server sends a push for an event addressed to a business account the device's root owns
- **THEN** the payload SHALL include the `accountId` and `accountType`

#### Scenario: Tapping a non-active account notification switches first
- **WHEN** the user taps a notification whose `accountId` differs from the active account
- **THEN** the client SHALL switch into that account (subject to the active-call guard) and then open the target screen

#### Scenario: Per-account badge distinction
- **WHEN** notifications exist for more than one owned account
- **THEN** the UI SHALL distinguish which account each notification belongs to
