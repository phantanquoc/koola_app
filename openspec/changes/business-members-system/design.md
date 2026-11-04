## Context

Current state: Business accounts can only be managed by their owner (the personal account that created them). The owner must share their personal password with employees to delegate management, creating security risks (no individual audit trail, can't revoke individual access) and operational problems (firing requires password rotation).

Koola uses:
- MongoDB with Mongoose (existing `users` collection for accounts)
- NestJS backend (existing JWT auth via Passport, guards pattern)
- React Native mobile (existing `AuthContext`, account switcher UI)
- Socket.IO for real-time (existing chat gateway pattern)

Constraints:
- Backwards compatible: existing owner-only businesses continue working
- Migration: auto-create Owner membership for existing business accounts
- Mobile: must work offline (invite acceptance requires network)
- Device limit: enforce 1 active session per member per business

## Goals / Non-Goals

**Goals:**
- Multi-member business accounts with role-based permissions (Owner/Admin/Editor/Viewer)
- Email-based invite flow with 7-day expiry
- Device session enforcement (1 business member = 1 active device)
- Audit log for business actions (who, what, when, device)
- Extend account switching to support member businesses (not just owned)

**Non-Goals:**
- Multi-factor authentication (separate effort)
- Fine-grained permissions beyond 4 roles (complex permission system out of scope)
- Real-time collaboration features (live cursors, etc.)
- Business analytics/reporting dashboard (different initiative)
- Transferring ownership between users (risky, defer to manual admin action)

## Decisions

### D1: Schema Design — Separate Collections vs Embedded

**Decision:** Use separate `business_members` collection (not embedded array in User document)

**Alternatives considered:**
- Embed members array in User document → rejected: breaks at scale (100+ members), hard to query "which businesses is user X a member of?"
- Single polymorphic "permissions" collection → rejected: over-abstraction, harder to index

**Rationale:**
- Efficient queries: "list members of business B" and "list businesses user U is a member of" both need indexes
- Mongoose populate pattern already used in codebase (conversations/messages)
- Scales to large teams without document size limits

### D2: Invite Tokens — Database vs JWT

**Decision:** JWT tokens (signed, 7-day expiry) stored in `business_invites` collection for revocation

**Alternatives considered:**
- Random token in DB only → rejected: requires DB lookup on every verify, no built-in expiry
- JWT only (no DB record) → rejected: can't revoke, can't track pending invites

**Rationale:**
- JWT provides tamper-proof expiry (no cron job to clean expired invites)
- DB record enables: list pending invites, revoke invite, track who invited whom
- Pattern matches existing OTP tokens in `users` schema

### D3: Permissions Enforcement — Guards vs Middleware

**Decision:** NestJS guards (decorator-based) checking role at controller method level

**Alternatives considered:**
- Express middleware → rejected: NestJS guards integrate with existing `JwtAuthGuard` pattern
- Service-level checks → rejected: too easy to forget, no framework enforcement

**Rationale:**
- Declarative: `@BusinessRole('editor')` makes permissions visible in controller
- Composable: stacks with existing `@UseGuards(JwtAuthGuard)`
- Framework: executes before route handler, consistent with existing auth pattern

### D4: Device Sessions — Fingerprint vs Device ID

**Decision:** Client-provided device ID (UUID persisted in AsyncStorage) + server validation

**Alternatives considered:**
- Server-side fingerprint (IP, User-Agent) → rejected: unreliable (NAT, VPN, browser updates)
- No device ID, use JWT `jti` claim → rejected: can't force logout across token refreshes

**Rationale:**
- Client-generated UUID is stable across app restarts
- Server tracks `(businessId, userId, deviceId)` tuples in `business_sessions`
- On login: if existing session with different deviceId → invalidate old, create new
- Push notification warns user of new device login

### D5: Audit Log Granularity — Event Types

**Decision:** Structured event schema with typed actions, not free-form logs

**Event types:**
- `member.*` (invited, accepted, role_changed, removed)
- `product.*` (created, updated, deleted) — commerce only
- `service.*` (created, updated, deleted) — services only
- `order.*` (status_changed, cancelled, refunded)
- `business.*` (settings_changed, deleted)

**Alternatives considered:**
- Free-form log messages → rejected: can't query "all product deletions", no type safety
- Single "action" enum → rejected: can't namespace by domain

**Rationale:**
- Queryable: "show all member changes" filters by `event.startsWith('member.')`
- Extensible: new domains add event namespaces without schema change
- Type-safe: DTO validation on event types

### D6: Migration Strategy — Existing Business Accounts

**Decision:** Auto-create Owner membership on first affected API call (lazy migration)

**Alternatives considered:**
- Migration script on deploy → rejected: risky at scale, blocks deploy, requires downtime planning
- Cron job post-deploy → rejected: eventual consistency confusion

**Rationale:**
- Zero downtime: old code works until new code deployed
- Lazy: only migrates active businesses (inactive ones never hit new endpoints)
- Idempotent: check "if no membership exists for owner → create" on every business operation
- Rollback-safe: old code ignores memberships, new code creates them on-demand

### D7: JWT Claims Extension — Role Storage

**Decision:** Add `role` claim to JWT when switching into member business (parallel to existing `act` claim)

**Before (owner-only):**
```typescript
{
  sub: "business_id",
  act: "owner_id",  // actor = root personal account
  accountType: "business"
}
```

**After (member):**
```typescript
{
  sub: "business_id",
  act: "member_personal_id",
  accountType: "business",
  role: "editor"  // NEW
}
```

**Alternatives considered:**
- Fetch role from DB on every request → rejected: defeats JWT statelessness, adds latency
- Encode role in `sub` (e.g., `business_id:editor`) → rejected: breaks existing code parsing `sub`

**Rationale:**
- `role` claim enables stateless permission checks in guards
- Token refresh reloads role (role changes take effect on next token refresh, acceptable UX)
- Backwards compatible: missing `role` claim defaults to `owner` (existing businesses)

## Risks / Trade-offs

### R1: Role Changes Take Up to 15 Minutes to Propagate
**Risk:** User role downgraded from Admin → Viewer, but their JWT (valid 15min) still claims Admin.

**Mitigation:**
- Acceptable UX: role changes are admin actions, not real-time
- If critical: implement JWT blacklist (Redis set of revoked token IDs) — deferred for v1

### R2: Device ID Can Be Spoofed
**Risk:** User extracts device ID from one device, injects into another to bypass device limit.

**Mitigation:**
- Device limit is deterrent, not cryptographic guarantee (like IP-based rate limiting)
- Audit log records device ID → detectable in post-incident review
- Future: tie device ID to push token (harder to spoof)

### R3: Invite Email Deliverability
**Risk:** Invite emails go to spam, user never receives link.

**Mitigation:**
- Owner sees "pending invites" list with "resend" button
- Invite link works from any source (forward email, copy link manually)
- 7-day expiry gives multiple retry opportunities

### R4: Audit Log Storage Growth
**Risk:** High-activity businesses generate 10k+ events/month → collection grows unbounded.

**Mitigation:**
- TTL index: `createdAt` field with 90-day expiry (MongoDB auto-deletes)
- Queryable window: 90 days covers compliance needs (tax records, dispute resolution)
- Future: archive to S3 for long-term retention if needed

### R5: Migration Race Condition
**Risk:** Two API calls for same business trigger concurrent "create owner membership" → duplicate key error.

**Mitigation:**
- Unique compound index: `(businessId, userId)` enforces one membership per user per business
- Catch duplicate key error → treat as success (idempotent operation)

### R6: Backwards Incompatible Mobile Clients
**Risk:** Old mobile clients (pre-members feature) can't handle member businesses in account list.

**Mitigation:**
- Backend: continue returning `ownerUserId` field (deprecated but present)
- Old clients: only show owned businesses (filter by `ownerUserId === currentUserId`)
- New clients: show owned + member businesses (query `business_members` collection)
- No forced upgrade required (graceful degradation)

## Migration Plan

### Phase 1: Backend Schema + Guards (Week 1)
1. Deploy schema changes (new collections with indexes)
2. Deploy lazy migration logic (auto-create owner membership)
3. Deploy permission guards (default to owner role if no membership found)
4. **Verify:** Existing business owners can still perform all actions (backwards compatible)

### Phase 2: Invite Flow Backend (Week 1)
5. Deploy invite endpoints (`POST /businesses/:id/invites`, `POST /invites/accept`)
6. **Verify:** Create test invite, accept from another account, verify membership created

### Phase 3: Mobile UI (Week 2-3)
7. Deploy mobile account switcher changes (show member businesses)
8. Deploy member management screens (owner/admin only)
9. Deploy invite flow (email → deep link → accept screen)
10. **Verify:** End-to-end invite flow on 2 physical devices

### Phase 4: Device Sessions + Audit (Week 3-4)
11. Deploy session tracking (create session on switch, force logout on duplicate)
12. Deploy audit log (instrument all business actions)
13. **Verify:** Login from 2nd device force-logs-out 1st device, audit log captures actions

### Rollback Strategy
- **Before Phase 3 (mobile not deployed):** Drop new collections, remove guards → instant rollback
- **After Phase 3 (mobile deployed):** Cannot rollback (mobile expects member APIs) → fix forward only
- **Safe rollback window:** 1 week (Phase 1-2 only)

## Open Questions

1. **Q1:** Should Viewer role see financial data (revenue, withdrawal history)?
   - **Proposed answer:** No — Viewer sees product/service/order data only, not financials. Add explicit financial permissions later if needed.

2. **Q2:** Can a business have multiple Owners, or is Owner always 1:1 with creator?
   - **Proposed answer:** Multiple Owners allowed (role can be assigned). Original creator has no special status beyond being auto-assigned Owner. Enables business transfer if needed.

3. **Q3:** What happens to a member's permissions when the business is deleted?
   - **Proposed answer:** Cascade delete: deleting business removes all memberships, invites, sessions, audit logs (MongoDB `onDelete: 'cascade'` refs). Member no longer sees business in account list.

4. **Q4:** Should push notification for "new device login" be sent even if the user themselves logged in?
   - **Proposed answer:** Yes — security best practice. User can dismiss if it was them. False positive (annoying notification) safer than false negative (missed unauthorized access).
