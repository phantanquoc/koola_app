## Why

Today every person in APP_KOOLA is a single `User` identity, and the only way to represent a company is the read-only `Business` directory listing in the Kết nối tab — where "Nhắn tin" actually chats with the human owner, not the company. Real users own multiple companies / household businesses and need each one to act as a first-class identity: send messages, join conversations, shop, and be discovered as itself. This change makes a business account a real switchable identity owned by a root user (the Facebook-Page model), and replaces the old directory-listing Business flow.

## What Changes

- **BREAKING**: Remove the old `Business` directory feature (backend `businesses` module + `business` / `business-connection` schemas + DTOs; mobile `businessesApi`, `useBusinessList`, `Business`/`CreateBusinessPayload` types, old chat-with-owner connect flow). Collections `businesses` + `businessconnections` are dropped ONLY after verifying they hold no needed data.
- A business account becomes a `User` document with `accountType: 'personal' | 'business'` (default `personal`) and `ownerUserId` (set only on business accounts). Business accounts carry no own email/password; `email`/`passwordHash` become conditionally-required (validated by `accountType` in the service) without breaking the unique email index.
- New business-identity profile fields on the account: `businessCategory`, `province`, `relationshipType` (`partner`|`supplier`), `tagline`, `description`, `address`, `website`, `contactEmail`, `contactPhone`, `logoKey`, `licenseImageKey`, `verificationStatus` (`pending`|`verified`|`rejected`, default `pending`), `rejectionReason`, `isBanned` (default `false`, reserved for the admin change).
- **BREAKING**: JWT access token payload gains an optional `act` (actor) claim and `accountType`. `JwtPayload` type + `JwtStrategy.validate` carry `act` through and expose `actorId`. `act` follows RFC 8693 delegation semantics (the human actor behind a business-account session) for auditability. The root refresh token is never rotated by a switch.
- New backend endpoints (under `/accounts`): `GET /accounts` (root personal + owned businesses), `POST /accounts/business` (create a business account, `verificationStatus: 'pending'`, owner can use immediately), `POST /accounts/switch` (issue a new access token for an owned account after an ownership check; banned target → 403).
- Soft limit: max business accounts per owner = configurable constant (default 10); exceeding returns a clear error.
- Mobile: extend `AuthContext` with `activeAccount`, `accounts`, `switchAccount()`, `switchBackToPersonal()`; switching performs a clean "light re-login" (re-init SQLite, re-wire local-first, reconnect socket+webrtc, re-register FCM) reusing the `dbInit` cross-account guard; `restoreSession` restores the last active account.
- Mobile: new "Danh sách tài khoản" screen in the Personal tab (list accounts + "Thêm tài khoản doanh nghiệp" create form reusing the old CreateBusiness UX + logo + business-license image upload via `mediaApi`). The account switcher lives here.
- Mobile: switching is BLOCKED while a call is active/ringing → "Hãy kết thúc cuộc gọi trước".
- Mobile: the Kết nối tab keeps its UI/filters (Đối tác/Nhà cung cấp sub-tabs, province, category, sort, search) but its data source becomes verified business accounts; "Nhắn tin"/"Kết nối" opens a direct conversation with the business account id itself.
- Notifications aggregate across all accounts with a per-account badge; push payload carries `accountId`/`accountType`; tapping auto-switches to the right account. One FCM token per device bound to the root user, routed by payload.
- `webrtc.gateway` `auth:refresh` is relaxed so a socket may re-authenticate to an account owned by the same root (not only the identical `sub`).

## Capabilities

### New Capabilities
- `account-identity`: The `User` model as a polymorphic identity supporting `personal` and `business` account types, ownership (`ownerUserId`), business profile fields, verification status, and the conditional email/password validation rules.
- `account-switching`: Ownership-checked issuance of a delegated access token (`act` claim) for an owned account, the `/accounts` listing, the `/accounts/switch` endpoint, token lifecycle/refresh, and the mobile clean re-init switch engine including the active-call guard.
- `business-account-registration`: Self-serve creation of a business account (`POST /accounts/business`) with full field + license-image validation, soft per-owner limit, and immediate owner usability while `pending`.
- `connect-discovery`: The Kết nối tab discovery surface re-sourced onto verified business accounts (filters/sort/search preserved) and direct messaging with the business account identity.

### Modified Capabilities
- `user-auth`: Access-token payload adds optional `act` actor claim and `accountType`; `JwtStrategy.validate` exposes the actor id; ownership-delegated tokens are minted without rotating the root refresh token. Login/register remain personal-only.

## Impact

**Backend (`chat-backend/`):**
- `src/users/user.schema.ts` — new fields + conditional email/password + indexes (`accountType`, `ownerUserId`, business filter fields).
- `src/auth/jwt.strategy.ts`, `src/auth/auth.service.ts` — `JwtPayload.act`/`accountType`, `validate` exposes `actorId`, token minting for switch.
- New `src/accounts/` module — controller + service + DTOs + `*.spec.ts` (`GET /accounts`, `POST /accounts/business`, `POST /accounts/switch`).
- `src/gateway/chat.gateway.ts`, `src/webrtc/webrtc.gateway.ts` — read `accountType`/actor from token; relax `auth:refresh` to same-root ownership.
- **Removed**: `src/businesses/**` (module, controller, service, schemas, DTOs).
- Data safety: verify `businesses` + `businessconnections` collections before dropping.

**Mobile (`ChatApp/`):**
- `src/contexts/AuthContext.tsx` — account state + `switchAccount`/`switchBackToPersonal` + restore active account.
- `src/services/api/apiService.ts` — new `accountsApi` (list/createBusiness/switch); remove `businessesApi`; access-token/refresh interceptor aware of active account.
- `src/navigation/PersonalTabStack.tsx` + `types.ts` — new `AccountList` (+ create) route.
- New `src/screens/main/AccountListScreen.tsx` + create-business form (reuses old CreateBusiness UX).
- `src/screens/connect/**`, `src/components/connect/**`, `src/hooks/useBusinessList` — re-sourced onto business accounts; remove old chat-with-owner logic; `Business`/`CreateBusinessPayload` types replaced by account-based types.
- `src/services/push/pushNotificationService.ts` + notification handling — per-account routing/badge.

**Cross-cutting:**
- High-risk per CLAUDE.md: `chat.gateway`, `webrtc.gateway`, `AuthContext`, `OfflineQueueService`, schema indexes, `main.ts` Redis adapter — additive changes preferred.
- `conversations.service.createDirect` is unchanged (already works with any two user ids).
- No `.env`/secret changes. No commits.
