## ADDED Requirements

### Requirement: Permission matrix enforced via guards

The system SHALL enforce a 4-tier permission matrix (Owner/Admin/Editor/Viewer) at the API level via NestJS guards.

#### Scenario: Owner has full permissions
- **WHEN** owner performs any action (create product, delete member, change settings, withdraw funds)
- **THEN** system allows the action

#### Scenario: Admin can manage content and members
- **WHEN** admin creates/updates/deletes products, processes orders, invites/removes members
- **THEN** system allows the action

#### Scenario: Admin cannot access financials
- **WHEN** admin attempts to withdraw funds or modify payment settings
- **THEN** system returns 403 Forbidden with message "Requires owner role"

#### Scenario: Editor can manage content only
- **WHEN** editor creates/updates/deletes products, processes orders, replies to messages
- **THEN** system allows the action

#### Scenario: Editor cannot manage members
- **WHEN** editor attempts to invite or remove members
- **THEN** system returns 403 Forbidden with message "Requires admin or owner role"

#### Scenario: Viewer has read-only access
- **WHEN** viewer views products, orders, messages, statistics
- **THEN** system allows the action

#### Scenario: Viewer cannot write
- **WHEN** viewer attempts to create product, update order, or send message as business
- **THEN** system returns 403 Forbidden with message "Requires editor role or higher"

#### Scenario: Personal user cannot post business content
- **WHEN** personal account (non-business) attempts to POST /commerce/products
- **THEN** system returns 403 Forbidden with message "Requires business account"

### Requirement: Role stored in JWT for stateless checks

The system SHALL include member role in JWT claims to enable stateless permission enforcement.

#### Scenario: JWT contains role claim
- **WHEN** member switches into business account
- **THEN** JWT includes role field (owner/admin/editor/viewer)

#### Scenario: Missing role defaults to owner
- **WHEN** JWT lacks role claim (backwards compatibility for existing businesses)
- **THEN** guards treat user as owner

#### Scenario: Role change propagates on token refresh
- **WHEN** admin downgrades member from editor to viewer
- **THEN** member's permissions change after next token refresh (up to 15 minutes)

### Requirement: Permissions documented in matrix

The system SHALL provide queryable permission matrix showing role capabilities.

#### Scenario: Permission matrix API
- **WHEN** client requests GET /permissions/matrix
- **THEN** system returns complete permission matrix for all roles

#### Scenario: Permission check API
- **WHEN** client submits (role, action) pair to GET /permissions/check
- **THEN** system returns boolean indicating if role can perform action

### Requirement: Guards apply to all business endpoints

The system SHALL protect commerce, services, and connections endpoints with role guards.

#### Scenario: Commerce endpoints protected
- **WHEN** any user calls POST /commerce/products without editor+ role
- **THEN** system returns 403 Forbidden before handler executes

#### Scenario: Services endpoints protected
- **WHEN** any user calls DELETE /services/:id without editor+ role
- **THEN** system returns 403 Forbidden before handler executes

#### Scenario: Connections endpoints protected
- **WHEN** any user calls POST /connections/posts without editor+ role
- **THEN** system returns 403 Forbidden before handler executes

#### Scenario: Member management protected
- **WHEN** any user calls DELETE /businesses/:id/members/:userId without admin+ role
- **THEN** system returns 403 Forbidden before handler executes

#### Scenario: Business settings protected
- **WHEN** any user calls PUT /businesses/:id/settings without owner role
- **THEN** system returns 403 Forbidden before handler executes
