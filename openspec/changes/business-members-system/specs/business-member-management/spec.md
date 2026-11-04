## ADDED Requirements

### Requirement: Owner/Admin can add members with roles

The system SHALL allow business account owners and admins to manage member list including adding, removing, and changing roles.

#### Scenario: List all members
- **WHEN** owner/admin requests member list
- **THEN** system returns all members with userId, displayName, avatar, role, joinedAt, lastActiveAt

#### Scenario: Non-member attempts list
- **WHEN** user who is not a member requests member list
- **THEN** system returns 403 Forbidden

#### Scenario: Viewer can list members
- **WHEN** viewer requests member list
- **THEN** system returns all members (read-only operation allowed for all roles)

### Requirement: Owner/Admin can change member roles

The system SHALL allow owners and admins to promote or demote members between roles.

#### Scenario: Successful role change
- **WHEN** owner/admin changes member role to valid role (admin/editor/viewer/owner)
- **THEN** system updates membership record and new role takes effect on next token refresh

#### Scenario: Demote last owner
- **WHEN** owner/admin attempts to demote the only remaining owner
- **THEN** system returns 400 Bad Request with message "Business must have at least one owner"

#### Scenario: Non-owner/admin attempts role change
- **WHEN** editor or viewer attempts to change role
- **THEN** system returns 403 Forbidden

#### Scenario: Change own role
- **WHEN** owner/admin attempts to change their own role
- **THEN** system returns 400 Bad Request with message "Cannot change your own role"

#### Scenario: Role change to invalid role
- **WHEN** owner/admin submits invalid role string
- **THEN** system returns 400 Bad Request with validation error

### Requirement: Owner/Admin can remove members

The system SHALL allow owners and admins to remove members from the business.

#### Scenario: Successful removal
- **WHEN** owner/admin removes member
- **THEN** system deletes membership record, invalidates member's sessions, and member no longer sees business in account list

#### Scenario: Remove last owner
- **WHEN** owner/admin attempts to remove the only remaining owner
- **THEN** system returns 400 Bad Request with message "Cannot remove last owner"

#### Scenario: Remove self
- **WHEN** owner/admin attempts to remove themselves
- **THEN** system returns 400 Bad Request with message "Cannot remove yourself, transfer ownership first"

#### Scenario: Non-owner/admin attempts removal
- **WHEN** editor or viewer attempts to remove member
- **THEN** system returns 403 Forbidden

### Requirement: Members see business in account list

The system SHALL include member businesses in user's account list alongside owned businesses.

#### Scenario: List accounts includes member businesses
- **WHEN** user requests account list
- **THEN** system returns personal account, owned businesses, and member businesses with role displayed

#### Scenario: Member business marked with owner name
- **WHEN** member business displayed in list
- **THEN** business shows owner's displayName in metadata (e.g., "Owned by John Doe")

#### Scenario: Removed member no longer sees business
- **WHEN** user who was removed from business requests account list
- **THEN** system does not include that business in results

### Requirement: Membership survives business owner changes

The system SHALL preserve member relationships when business ownership changes.

#### Scenario: Original owner demoted to admin
- **WHEN** new owner demotes original creator to admin
- **THEN** system updates membership role, original creator retains admin access

#### Scenario: Business deleted removes all memberships
- **WHEN** owner deletes business account
- **THEN** system cascade-deletes all memberships for that business
