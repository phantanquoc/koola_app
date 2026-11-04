## Why

The current system only allows 1:1 mapping between a personal account and business accounts — the owner must share their password with employees to delegate management. This creates security risks (no audit trail, can't revoke access individually) and operational problems (firing an employee requires changing the owner's password). Businesses need team collaboration with role-based permissions, individual authentication, and device limits.

## What Changes

- **New**: Business membership system — owners can invite members (email-based) with roles (Owner/Admin/Editor/Viewer)
- **New**: Role-based permissions enforced at API level via guards checking `businessId + userId + role`
- **New**: Device limit — 1 business member = 1 active device session (force logout on new login)
- **New**: Audit log — track who did what on business accounts (product creation, order updates, member changes)
- **Modified**: JWT strategy — extend `act` claim to include `role` for business members
- **Modified**: Account switching — support switching into businesses where user is a member (not just owner)
- **Modified**: Mobile account switcher UI — show member businesses + role badges

## Capabilities

### New Capabilities

- `business-member-invites`: Email-based invite flow with 7-day expiry tokens, accept/reject actions
- `business-member-management`: CRUD operations for members (invite, list, change role, remove) with ownership checks
- `business-role-permissions`: 4-tier permission matrix (Owner/Admin/Editor/Viewer) enforced via guards on commerce/services/connections endpoints
- `business-device-sessions`: Session tracking per business member with device fingerprinting, force logout on duplicate login
- `business-audit-logs`: Event logging for business actions (who, what, when, device) with queryable history

### Modified Capabilities

- `account-switching`: Extend to support member accounts (not just owned businesses) — check `business_members` collection in addition to `ownerUserId`

## Impact

**Backend (NestJS)**:
- New collections: `business_members`, `business_invites`, `business_sessions`, `business_audit_logs`
- New modules: `BusinessMembersModule`, `BusinessInvitesModule`, `BusinessSessionsModule`, `AuditLogsModule`
- Modified guards: `JwtStrategy`, `BusinessCategoryGuard` (check role permissions)
- Modified controllers: `AccountsController` (switch logic), `CommerceController`, `ServicesController`, `ConnectionsController` (apply permission guards)

**Mobile (React Native)**:
- New screens: `ManageMembersScreen`, `InviteMemberScreen`, `AcceptInviteScreen`, `AuditLogScreen`
- New components: `MemberListItem`, `InviteListItem`, `RolePicker`, `DeviceStatusBadge`, `PermissionGate`
- Modified contexts: `AuthContext` (handle member accounts in `listAccounts`, `switchAccount`)
- Modified UI: `AccountSwitcherModal` (show member businesses + roles), FAB visibility logic (check role permissions)

**Database**:
- 4 new MongoDB collections with indexes on `businessId`, `userId`, `email`, `deviceId`

**Security**:
- JWT claims extended with `role` field
- All business write operations gated by role checks
- Device fingerprinting for session enforcement
