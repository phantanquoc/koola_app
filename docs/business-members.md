# Business Members — Team Roles, Invites, Device Sessions, Audit Log

Openspec change: `business-members-system`. Builds on account switching
(`docs/business-accounts-flow.md` §3): a business is still a `User` row with
`accountType: 'business'`; members act as it through a delegated token.

Code: `chat-backend/src/business-members/`, guards in `chat-backend/src/common/guards/`,
mobile screens in `ChatApp/src/screens/business/`.

## 1. Architecture

```
Personal login (root token: sub = me)
  │  POST /api/accounts/switch { targetAccountId }   + X-Device-* headers
  ▼
AccountsService.switchAccount
  1. owner?  → ensureOwnerMembership (lazy migration, §5)
     member? → business_members row, status 'active' (suspended → 403)
  2. X-Device-ID present → BusinessSessionsService.createOrReplaceSession
       other device held it → delete row + push `business_session_ended` to it
  3. mint { sub: businessId, act: me, accountType: 'business', role }
  ▼
Every business request passes, in order:
  JwtAuthGuard → ThrottlerGuard → BusinessSessionGuard (global)
  → BusinessRoleGuard (per route)  → handler → BusinessSessionActivityInterceptor
```

| Collection | Key | Purpose |
|---|---|---|
| `business_members` | unique `(businessId, userId)`, `userId` | role + status per member |
| `business_invites` | `token`, `(businessId, status)` | pending / accepted / revoked invites |
| `business_sessions` | unique `(businessId, userId)`, `deviceId` | the ONE device a member may use |
| `business_audit_logs` | `(businessId, createdAt)`, `eventType`, TTL 90 days | who did what |

### Guards

- **`BusinessRoleGuard`** + `@BusinessRole('admin')` — minimum role, hierarchy
  `owner 4 > admin 3 > editor 2 > viewer 1`. Rejects personal sessions (403). It
  also enforces **tenant scope**: a `:businessId` / `:id` route param must equal the
  token's `sub`, so a role in business A never applies to business B (403
  `Not acting as this business`). Every business-scoped route must use it — that is
  what makes the URL id trustworthy.
- **`BusinessSessionGuard`** (global `APP_GUARD`) — 401 `BUSINESS_SESSION_ENDED`
  when the session row names a different device than `X-Device-ID`. Passes when
  there is no header, no row, or a personal session. Exempt with
  `@SkipBusinessSessionCheck()` — only `POST /accounts/switch` (claims the row)
  and `POST /auth/logout` (releases it).
- **`BusinessSessionActivityInterceptor`** (global) — touches
  `business_sessions.lastActiveAt` after a successful business call.

### Mobile

- `DeviceIdService` — UUID in AsyncStorage, sent as `X-Device-ID` on every request.
- `apiService` — a 401 carrying `BUSINESS_SESSION_ENDED` is NOT refreshed (refresh
  would re-switch and evict the device that just took over). AuthContext drops to
  the personal account; App.tsx shows "Phiên làm việc đã kết thúc".
- Push taps (`services/push/businessTapRoute.ts`): `business_session_ended` acts
  only on the device named in `evictedDeviceId`; `business_event` opens AuditLog.
- UI gating: `useBusinessPermissions()` / `PermissionGate` read the same matrix
  (`PERMISSION_MIN_ROLE` in `src/types`). UX only — the backend is the boundary.

## 2. Permission matrix

Served by `GET /api/permissions/matrix`. Mobile copy in `ChatApp/src/types/index.ts`;
`useBusinessPermissions.spec.ts` fails if the two drift.

| Action | owner | admin | editor | viewer |
|---|:-:|:-:|:-:|:-:|
| `analytics.view` | ✓ | ✓ | ✓ | ✓ |
| `product.create` / `update` / `delete` | ✓ | ✓ | ✓ | |
| `order.process` | ✓ | ✓ | ✓ | |
| `order.refund` | ✓ | ✓ | | |
| `member.invite` / `remove` / `changeRole` | ✓ | ✓ | | |
| `business.settings` | ✓ | ✓ | | |
| `business.delete` | ✓ | | | |

Enforced today:

| Route | Min role |
|---|---|
| `GET /businesses/:id/members` | viewer |
| `PUT /businesses/:id/members/:userId/role` | admin |
| `DELETE /businesses/:id/members/:userId` | admin |
| `POST · GET /businesses/:id/invites` | admin |
| `DELETE /businesses/:businessId/invites/:inviteId` · `POST …/resend` | admin |
| `GET /businesses/:id/sessions` · `DELETE /businesses/:businessId/sessions/:sessionId` | admin |
| `GET /businesses/:id/audit-logs` | admin |
| `GET /invites/verify` · `POST /invites/accept` | signed in (any account) |

Service-level rules on top: no self role-change / self-removal / self force-logout
(400); the last owner can't be demoted or removed (400); invites can't grant
`owner`.

**Not enforced yet:** `product.*` / service / post writes. No seller-facing write
endpoint exists — catalog writes are platform-admin routes (`AdminCommerceController`).
Add `@BusinessRole('editor')` when seller routes land (tasks 4.4–4.6).

Role changes take effect on the member's next switch / token refresh (≤ access
token lifetime) — the role lives in the JWT.

## 3. Invite flow — API examples

`$TOKEN` = business token (after switch) unless noted. Base `http://<host>:3000/api`.
There is no Postman collection in the repo; these are the runnable equivalents.

```bash
# 1. Admin invites (role: admin | editor | viewer). Email carries koola://invite?token=<jwt>
curl -X POST "$API/businesses/$BIZ/invites" -H "Authorization: Bearer $TOKEN" \
  -H "X-Device-ID: $DEVICE" -H "Content-Type: application/json" \
  -d '{"email":"staff@example.com","role":"editor"}'

# 2. Invitee previews (any signed-in token)
curl "$API/invites/verify?token=$INVITE_JWT" -H "Authorization: Bearer $INVITEE_TOKEN"

# 3. Invitee accepts — the signed-in email must match the invite email
curl -X POST "$API/invites/accept" -H "Authorization: Bearer $INVITEE_TOKEN" \
  -H "Content-Type: application/json" -d "{\"token\":\"$INVITE_JWT\"}"

# 4. Invitee switches in (claims the device session)
curl -X POST "$API/accounts/switch" -H "Authorization: Bearer $INVITEE_TOKEN" \
  -H "X-Device-ID: $DEVICE" -H "X-Device-Model: Pixel 8" \
  -H "Content-Type: application/json" -d "{\"targetAccountId\":\"$BIZ\"}"

# Manage
curl "$API/businesses/$BIZ/invites" -H "Authorization: Bearer $TOKEN"
curl -X POST   "$API/businesses/$BIZ/invites/$INVITE_ID/resend" -H "Authorization: Bearer $TOKEN"
curl -X DELETE "$API/businesses/$BIZ/invites/$INVITE_ID"        -H "Authorization: Bearer $TOKEN"
```

Invite JWT expires after 7 days. Accepting when already a member returns
`{ alreadyMember: true }` (the app then just switches in). Inviting an existing
member or an email with a pending invite → 409.

## 4. Device sessions

One active device per `(business, member)`. A switch from device B deletes A's row
and pushes `business_session_ended { businessId, evictedDeviceId }` to the member.
A's next business request gets 401 `BUSINESS_SESSION_ENDED`. Admins see and force-out
sessions via `/businesses/:id/sessions`; logout deletes the caller's rows.

## 5. Migration of existing businesses

No script, no downtime. `ensureOwnerMembership(businessId)` runs inside
`switchAccount`: if the business has an `ownerUserId` it inserts an `owner`
membership. A duplicate-key error (11000) means it already exists and is treated as
success, so it is safe on every switch and under concurrency.

- Before the owner's first switch after deploy, the business has no membership rows;
  `listAccounts` still shows it through `ownerUserId`.
- Old tokens without `role` are treated as `owner` (they could only be minted for
  owners). They expire within the access-token lifetime.
- Businesses switched into before device tracking have no session row —
  `BusinessSessionGuard` lets them pass until the next switch claims one.
- Rollback: old code ignores the four new collections.

## 6. Audit log

`BusinessAuditLogsService.auditLog(...)` — failures are logged and swallowed; an audited
action is never rolled back because logging failed. Rows expire after 90 days (TTL).

| eventType | Written by | Notes |
|---|---|---|
| `member.invited` | `BusinessInvitesService.createInvite` | `metadata.email`, `metadata.role`; `resourceId` = invite |
| `member.role_changed` | `BusinessMembersService.changeMemberRole` | `changes.before.role` / `changes.after.role`; promotion to owner pushes owners |
| `member.removed` | `BusinessMembersService.removeMember` | pushes other owners; sessions invalidated |
| `order.status_changed` | `OrdersService` confirm / ship / receive | on the SELLER business; `metadata.actedAs` |
| `order.cancelled` | `OrdersService` reject / cancel | buyer-side cancel is logged on the seller |

Not emitted yet (no endpoint): `product.*`, `service.*`, `post.*`, `business.*`,
`order.refunded`. The auto-deliver cron writes nothing — there is no human actor.

Query (admin+):

```bash
curl "$API/businesses/$BIZ/audit-logs?eventType=member.removed&startDate=2026-10-01T00:00:00Z&page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"
# → { logs: [{ id, actor{_id,displayName,avatar}, eventType, resourceId, changes, metadata, deviceId, createdAt }], total, page, limit }
```

Filters: `startDate`, `endDate` (ISO), `eventType` (exact), `actorId`; `page` ≥ 1,
`limit` 1–100 (default 20), newest first.
