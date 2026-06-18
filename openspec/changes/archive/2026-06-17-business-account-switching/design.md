## Context

APP_KOOLA identity is `userId` everywhere: `message.senderId`, `conversation.members[].userId`, socket room `user:<userId>`, SQLite `initDb(userId)`, FCM registration, and presence. JWT access payload is `{ sub: userId, email }`; `JwtStrategy.validate` returns `{ id, userId, email }`; controllers read `@CurrentUser('id')`; `chat.gateway`/`webrtc.gateway`/`WsAuthGuard` verify the token manually and read `payload.sub`.

The old `Business` feature is a separate `businesses` collection (directory listing) plus a `businessconnections` join collection; "Nhắn tin" resolves `business.ownerId` and chats with the human owner. It is being replaced.

Because identity is uniformly `userId`, the cleanest way to make a company "act as itself" is to make a business account a real `User` so all existing message/conversation/socket/SQLite/commerce code works unchanged. `conversations.service.createDirect(a,b)` already works with any two user ids — verified directly.

## Goals / Non-Goals

**Goals:**
- A business account is a `User` (`accountType: 'business'`, `ownerUserId`) that owns no credentials and is entered only by switching from its root owner.
- Ownership-checked switch endpoint mints a delegated access token (`act` = root actor) without rotating the root refresh token.
- Self-serve business creation (pending verification, owner-usable immediately), soft per-owner limit.
- Mobile clean "light re-login" switch (no listener leaks, no cross-account data bleed), active-call guard, last-active-account restore.
- Kết nối tab re-sourced onto verified business accounts with filters/search preserved; DM opens against the business account id.
- Aggregated notifications with per-account badge + payload-routed auto-switch.
- Remove old Business flow safely.

**Non-Goals:**
- Admin web / approval UI / role system → separate change `admin-web-platform`. This change only writes `verificationStatus: 'pending'` and reads `verified` for discovery; nothing flips it to `verified` here (verify by manual DB edit during this change's testing).
- Multi-admin roles on a business account (only the single `ownerUserId` owner can switch in for now).
- Changing `messages`/`conversations` schemas.
- E2E encryption, payments.

## Decisions

### D1: Business fields live ON the `User` document (no separate BizProfile collection)
**Decision:** Add business fields directly to `User`, gated by `accountType`.
**Why:** Identity is `userId` everywhere; a business account must BE a `User` to be a `senderId`/member/socket-room/SQLite owner with zero changes to hot paths. A separate `BusinessProfile` collection would force a join on every identity read (chat headers, member hydration, Connect cards) and risk drift between the User and its profile. Business fields are sparse on personal users (absent) — acceptable.
**Alternative considered:** `BusinessProfile` keyed by `userId`. Rejected: extra join on hot paths, two-write consistency burden, no benefit since the account already must be a User.
**Constraint:** Keep append-only; do not touch `messages`/`conversations` schemas.

### D2: Conditional email/password (relax required-ness, preserve unique email index)
**Decision:** Remove schema-level `required` on `email` and `passwordHash`; enforce them in the auth/users service ONLY when `accountType === 'personal'`. Keep the email index unique **sparse** so multiple business docs with no `email` field do not collide. Business accounts are created with `email`/`passwordHash` simply unset (field absent).
**Why:** Business accounts have no credentials but must remain valid `User` docs. A unique sparse index ignores documents missing the field, so any number of credential-less business accounts coexist. Personal-user validation stays strict at the service layer.
**Alternative considered:** Synthetic placeholder emails for businesses. Rejected: pollutes the unique namespace, risks accidental login surface, harder to reason about.
**Index safety task:** Confirm the existing email index is (or is migrated to) `unique + sparse`; if currently a plain unique index created via `@Prop({ unique:true })`, switch to an explicit `schema.index({ email: 1 }, { unique: true, sparse: true })` and drop the duplicate decorator flag to avoid the duplicate-index warning (per CLAUDE.md).

### D3: Delegated token with `act` claim (RFC 8693), no refresh rotation on switch
**Decision:** Switch issues a NEW access token `{ sub: targetAccountId, act: rootUserId, accountType }`. `JwtPayload` adds optional `act` + `accountType`; `JwtStrategy.validate` returns `{ id, userId, email, actorId, accountType }` where `actorId = payload.act ?? payload.sub`. The root refresh token is untouched.
**Why:** `sub` must be the acting identity so all `@CurrentUser('id')` reads, `senderId`, and socket rooms naturally scope to the business account. `act` records the human behind the action for audit and for re-deriving ownership on a subsequent switch. Not rotating the refresh token keeps the durable credential anchored to the root human.
**Ownership resolution on switch:** root = `token.act ?? token.sub`. Allow if `target === root` (back to personal) OR `User(target).ownerUserId === root`. Else 403. Banned target → 403.

### D4: Token lifecycle & 401 recovery while in a business account
**Decision:** Mobile persists `activeAccountId` (durable, e.g. AsyncStorage). Access token stays in-memory. The durable refresh token always belongs to the ROOT. Recovery ladder on 401 when `activeAccountId` is a business account:
1. `POST /auth/refresh` with the root refresh token → new ROOT access token (personal).
2. If `activeAccountId !== rootId` → `POST /accounts/switch { targetAccountId: activeAccountId }` with the root access token → biz access token.
3. Retry the original request with the biz token.
`restoreSession` follows the same ladder: refresh root → if a stored `activeAccountId` is a business account, switch into it → init under that account.
**Why:** The refresh endpoint is unchanged and root-anchored; the switch endpoint is the single place that re-derives a biz token, so recovery and cold-start reuse one code path.

### D5: Mobile switch = clean "light re-login" sequence
**Decision:** `switchAccount(targetId)` performs, in order: (a) **guard**: if a call is active/ringing, abort with "Hãy kết thúc cuộc gọi trước"; (b) `POST /accounts/switch` → biz access token; (c) tear down current account exactly like logout's local-first teardown (unwire local-first, pause outbox, `setCurrentUserId(null)`, `momentsService.setCurrentUserId(null)`, disconnect socket+webrtc, `shutdownDb()` — but DO NOT clear the root refresh token); (d) set new access token in-memory, persist `activeAccountId`; (e) re-init like login: `setCurrentUserId(target)`, `momentsService.setCurrentUserId(target)`, `initDb(target)` (cross-account guard ensures a clean per-account DB), `wireLocalFirst()`, `socketService.connect(newToken)`, `webrtcService.connect(newToken)`, re-register FCM context; (f) `setActiveAccount(target)`.
**Why:** Reusing the proven logout→login teardown/re-init ordering prevents listener leaks and cross-account data bleed; the `dbInit` cross-account guard is the existing safety net.
**Alternative considered:** Hot-swap token only, keep DB/socket. Rejected: SQLite is per-`userId`; socket rooms are `user:<id>`; mixing would leak another account's data.

### D6: Socket auth across switch (`webrtc.gateway` auth:refresh + chat.gateway)
**Decision:** Mobile reconnects sockets with the new token (D5e). The `webrtc.gateway` `auth:refresh` handler's `currentSub === sub` check is relaxed: accept the new token if the new `sub` is the same as the current, OR the new token's actor (`act`) matches the current actor/owner — i.e. switching to an account owned by the same root is allowed. Gateways read `accountType`/actor from the verified payload for logging/audit. Presence/rooms continue to key on `sub` (the active account).
**Why:** A switch is a legitimate identity change for the same human; the guard must not reject it, but must still reject tokens from a different human.

### D7: Connect tab re-sourced onto verified business accounts (UI preserved)
**Decision:** Keep the Kết nối UI shell, sub-tabs (Đối tác/Nhà cung cấp via `relationshipType`), province/category filters, sort, and search. Replace the data source: a new `GET` discovery endpoint (in the accounts/connect surface) lists `User` docs where `accountType='business'` AND `verificationStatus='verified'` AND `isBanned=false`, filterable by `relationshipType`/`province`/`businessCategory`/text. Card actions call `conversationsApi.startDirectChat(businessUserId)` → open Chat with the business account itself.
**Why:** Preserves the validated UX while pointing it at the new identity model; `createDirect` already supports a business `userId` target unchanged.

### D8: Notifications — one device token on root, payload-routed, aggregated badge
**Decision:** Keep one FCM token per device bound to the ROOT user. Server includes `accountId`/`accountType` in the push payload for any account the device's root owns. Client aggregates and badges per account; tapping a notification for a non-active account triggers `switchAccount(accountId)` then navigates.
**Why:** Mirrors Meta's model; avoids per-account token registration complexity. Routing lives in the payload, not the transport.

### D9: Old Business removal with data-safety gate
**Decision:** Remove backend `businesses` module/controller/service, `business.schema`, `business-connection.schema`, DTOs, and mobile `businessesApi`/`useBusinessList`/old types. Before dropping the `businesses`/`businessconnections` collections, a verification task counts documents; if non-empty, DO NOT drop — surface the count and stop for a human decision (no silent data loss).
**Why:** ROOT-CAUSE COMPLETION forbids destructive shortcuts; the directory data may matter.

### D10: Soft per-owner limit
**Decision:** A configurable constant `MAX_BUSINESS_ACCOUNTS_PER_OWNER` (default 10) checked in `accounts.service` before create; exceeding → `409 Conflict` with a clear message.
**Why:** Cheap abuse guard, easy to raise later; service-layer check keeps it out of the schema.

## Risks / Trade-offs

- **Unique email index migration** → If the live index is plain-unique (not sparse), credential-less business docs could violate it. Mitigation: D2 index task explicitly ensures `unique + sparse` and removes any duplicate decorator flag; verify index creation in a test/dev DB before relying on it.
- **Switch teardown race (in-flight outbox/socket writes under the old account)** → Mitigation: reuse logout's ordering (pause outbox + unwire BEFORE re-init), and the `dbInit` cross-account guard rejects writes to a mismatched account DB.
- **401 recovery loop if switch fails** → Mitigation: if step-2 switch fails, fall back to root personal (clear `activeAccountId`), surface a non-fatal notice; never infinite-retry.
- **`act` claim trust** → `act` is inside a signed JWT; ownership is RE-checked server-side on every switch (never trust client-supplied target without the ownership query). Banned accounts rejected at switch.
- **Gateway auth relaxation widening access** → Mitigation: relax ONLY to same-root-owned accounts (D6); a token for a different human is still rejected.
- **High-risk files (chat.gateway, webrtc.gateway, AuthContext, OfflineQueue, indexes, main.ts)** → Mitigation: additive edits, read fully first, run impact analysis (GitNexus) before editing symbols, `detect_changes` before done.

## Migration Plan

1. Backend additive first: `User` schema fields + index safety (D1/D2), `JwtPayload`/`validate` (`act`/`accountType`, D3) — backward-compatible (existing tokens lack `act`; `actorId` falls back to `sub`).
2. New `accounts` module: `GET /accounts`, `POST /accounts/business`, `POST /accounts/switch` + service ownership/limit/banned logic + `*.spec.ts`.
3. Connect discovery endpoint over verified business accounts (D7).
4. Gateway reads of `accountType`/actor + `auth:refresh` relaxation (D6).
5. Mobile: `accountsApi`, `AuthContext` switch engine (D5) + 401/restore ladder (D4), AccountList + create UI, Connect re-source (D7), notifications routing (D8).
6. Remove old Business flow (D9) AFTER Connect re-source compiles against the new source; run the data-safety collection check before any drop.
7. Checks: backend `npm run lint` + `npm test`; mobile `npm run tsc` + `npm run lint`.
**Rollback:** Steps 1–4 are additive and safe to leave; the destructive collection drop (step 6) is gated and reversible-by-omission (skip drop). Mobile changes ship together; reverting the app build reverts UI.

## Open Questions

- None blocking. The single inter-change seam is `verificationStatus`: this change leaves accounts `pending`; `admin-web-platform` provides the approve/reject transition. Manual DB edit is used to exercise `verified` discovery during this change's testing.
