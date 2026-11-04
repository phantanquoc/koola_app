## ADDED Requirements

### Requirement: Owner/Admin can invite members via email

The system SHALL allow business account owners and admins to invite new members by email address with a specified role.

#### Scenario: Successful invite creation
- **WHEN** owner/admin submits valid email + role (admin/editor/viewer)
- **THEN** system creates invite record with 7-day expiry JWT token and sends email

#### Scenario: Duplicate email invite
- **WHEN** owner/admin invites email that already has pending invite
- **THEN** system returns 409 Conflict with message "Invite already pending for this email"

#### Scenario: Invite existing member
- **WHEN** owner/admin invites email of existing member
- **THEN** system returns 409 Conflict with message "User is already a member"

#### Scenario: Non-owner/admin attempts invite
- **WHEN** editor or viewer attempts to invite
- **THEN** system returns 403 Forbidden

#### Scenario: Invalid email format
- **WHEN** owner/admin submits malformed email
- **THEN** system returns 400 Bad Request with validation error

### Requirement: Invite email contains deep link

The system SHALL send invite emails with deep links that open the mobile app or redirect to registration.

#### Scenario: Email received
- **WHEN** invite created
- **THEN** email sent to invitee with subject "You've been invited to [Business Name]"

#### Scenario: Deep link format
- **WHEN** user clicks email link
- **THEN** link follows format `app://invite?token={jwt}` for mobile app

#### Scenario: Email contains business context
- **WHEN** email rendered
- **THEN** email displays business name, inviter name, and role being offered

### Requirement: Invitee can accept invite

The system SHALL allow invitees to accept invites after authenticating, creating membership with specified role.

#### Scenario: Authenticated user accepts invite
- **WHEN** logged-in user submits valid invite token
- **THEN** system creates membership record with role from invite and marks invite as accepted

#### Scenario: Unauthenticated user accepts invite
- **WHEN** non-logged-in user clicks invite link
- **THEN** system redirects to login/registration with token preserved in URL

#### Scenario: Expired token
- **WHEN** user submits invite token older than 7 days
- **THEN** system returns 410 Gone with message "Invite has expired"

#### Scenario: Revoked invite
- **WHEN** user submits token for invite that was manually revoked
- **THEN** system returns 403 Forbidden with message "Invite was revoked"

#### Scenario: Already accepted invite
- **WHEN** user submits token for already-accepted invite
- **THEN** system returns 409 Conflict with message "Invite already accepted"

### Requirement: Owner/Admin can revoke pending invites

The system SHALL allow owners and admins to cancel pending invites before they are accepted.

#### Scenario: Successful revocation
- **WHEN** owner/admin revokes pending invite
- **THEN** system marks invite as revoked and token becomes invalid

#### Scenario: Revoke accepted invite
- **WHEN** owner/admin attempts to revoke accepted invite
- **THEN** system returns 400 Bad Request with message "Cannot revoke accepted invite, remove member instead"

#### Scenario: Non-owner/admin attempts revoke
- **WHEN** editor or viewer attempts to revoke invite
- **THEN** system returns 403 Forbidden

### Requirement: Owner/Admin can resend invite email

The system SHALL allow owners and admins to resend invite emails for pending invites.

#### Scenario: Successful resend
- **WHEN** owner/admin resends pending invite
- **THEN** system sends new email with same token, updates sentAt timestamp

#### Scenario: Resend expired invite
- **WHEN** owner/admin resends invite older than 7 days
- **THEN** system returns 400 Bad Request with message "Invite expired, create new invite"

#### Scenario: Resend accepted invite
- **WHEN** owner/admin attempts to resend accepted invite
- **THEN** system returns 400 Bad Request with message "Invite already accepted"

### Requirement: Owner/Admin can list pending invites

The system SHALL allow owners and admins to view all pending invites for their business.

#### Scenario: List invites
- **WHEN** owner/admin requests invite list
- **THEN** system returns all pending invites with email, role, invitedBy, sentAt, expiresAt

#### Scenario: Filter by status
- **WHEN** owner/admin requests invites with status filter (pending/accepted/revoked/expired)
- **THEN** system returns invites matching filter

#### Scenario: Non-owner/admin attempts list
- **WHEN** editor or viewer attempts to list invites
- **THEN** system returns 403 Forbidden
