## 1. Backend — Account Identity Schema

- [x] 1.1 Run GitNexus impact analysis on `User` schema and `JwtStrategy.validate` before editing; report blast radius
- [x] 1.2 Extend `chat-backend/src/users/user.schema.ts`: add `accountType: 'personal' | 'business'` (default `personal`), `ownerUserId` (ObjectId ref `User`, optional)
- [x] 1.3 Add business profile fields to `User`: `businessCategory`, `province`, `relationshipType` (`partner`|`supplier`), `tagline`, `description`, `address`, `website`, `contactEmail`, `contactPhone`, `logoKey`, `licenseImageKey` (all optional)
- [x] 1.4 Add `verificationStatus` (`pending`|`verified`|`rejected`, default `pending`), `rejectionReason` (optional), `isBanned` (boolean, default `false`) to `User`
- [x] 1.5 Relax schema-level `required` on `email` and `passwordHash`; ensure the `email` unique index is declared via `schema.index({ email: 1 }, { unique: true, sparse: true })` and remove any duplicate `@Prop({ unique: true })` flag to avoid duplicate-index warning
- [x] 1.6 Add indexes via `schema.index()` for `accountType`, `ownerUserId`, `relationshipType`, `province`, `businessCategory`, `verificationStatus`
- [x] 1.7 Enforce credential presence for `personal` accounts at the service layer (users/auth service): reject personal creation without email/password; allow business creation without them ← (verify: business doc persists with no email/passwordHash; two such docs coexist under the sparse unique email index; personal creation without credentials is rejected; existing users load as `accountType:'personal'` without throwing)

## 2. Backend — JWT Actor Claim & Token Minting

- [x] 2.1 Update `JwtPayload` in `chat-backend/src/auth/jwt.strategy.ts` to add optional `act?: string` and `accountType?: 'personal'|'business'`
- [x] 2.2 Update `JwtStrategy.validate` to return `actorId = payload.act ?? payload.sub` alongside existing `{ id, userId, ... }`; keep backward compatibility for tokens without `act`
- [x] 2.3 Add a token-minting method in `auth.service` to sign an access token with `{ sub, act, accountType }` (reuse existing signing config/expiry); do NOT rotate or touch the refresh token here ← (verify: minted business token decodes to `sub=businessId, act=rootId`; legacy token without `act` yields `actorId===sub`)

## 3. Backend — Accounts Module (list / create / switch)

- [x] 3.1 Create `chat-backend/src/accounts/` module: `accounts.module.ts`, `accounts.controller.ts`, `accounts.service.ts`, wired into `AppModule`
- [x] 3.2 Implement `GET /accounts`: resolve root id from `actorId`, return root personal account + business accounts where `ownerUserId === root` (include `verificationStatus`, `logoKey`, `displayName`, `avatar`, `accountType`)
- [x] 3.3 Create `CreateBusinessAccountDto` (class-validator): required `displayName`, `businessCategory`, `province`, `relationshipType` (enum), `licenseImageKey`; optional `tagline`, `description`, `address`, `website`, `contactEmail`, `contactPhone`, `logoKey`
- [x] 3.4 Implement `POST /accounts/business`: create business `User` with `ownerUserId = root`, `accountType='business'`, `verificationStatus='pending'`; enforce `MAX_BUSINESS_ACCOUNTS_PER_OWNER` (configurable constant, default 10) returning HTTP 409 when exceeded
- [x] 3.5 Implement `SwitchAccountDto` (`targetAccountId`) and `POST /accounts/switch`: resolve root = `actorId`; allow if `target===root` OR `User(target).ownerUserId===root`; reject non-owned with 403; reject `isBanned` target with 403; mint `{ sub: target, act: root, accountType }` token; return token without rotating refresh token
- [x] 3.6 Add `accounts.service.spec.ts`: ownership pass/fail, switch-back-to-personal, banned target 403, soft-limit 409, create sets pending+owner ← (verify: every scenario in `specs/account-switching` and `specs/business-account-registration` has a passing test; switch does not rotate refresh token)

## 4. Backend — Connect Discovery Endpoint

- [x] 4.1 Add a discovery endpoint (in `accounts` or a `connect` controller) listing `User` where `accountType='business'` AND `verificationStatus='verified'` AND `isBanned=false`; support filters `relationshipType`, `province`, `businessCategory`, text search on display name, sort, and cursor/pagination consistent with the prior business list shape the mobile UI expects
- [x] 4.2 Ensure the response item shape maps cleanly to the existing Connect card (id, displayName, logoKey, tagline, relationshipType, province, businessCategory, verification badge) ← (verify: pending/rejected/banned businesses are excluded; filters and search return only matching verified businesses; shape consumable by existing Connect UI)

## 5. Backend — Gateway Identity & Socket Re-Auth

- [x] 5.1 Run GitNexus impact analysis on `chat.gateway.ts` and `webrtc.gateway.ts` before editing; report blast radius (HIGH-risk files)
- [x] 5.2 Update `chat.gateway` and `webrtc.gateway` connection handlers to read `accountType`/actor from the verified payload (additive; presence/rooms continue keying on `sub`)
- [x] 5.3 Relax `webrtc.gateway` `auth:refresh`: accept the new token when its actor (`act`) matches the current connection's actor/owner (same-root switch), still reject a token from a different human ← (verify: re-auth to an owned account is accepted and updates socket identity; re-auth to a foreign identity is rejected; no message loss/room leak on switch)

## 6. Mobile — API Layer

- [x] 6.1 Add `accountsApi` to `ChatApp/src/services/api/apiService.ts`: `list()` (GET /accounts), `createBusiness(payload)` (POST /accounts/business), `switch(targetAccountId)` (POST /accounts/switch)
- [x] 6.2 Add account-based discovery method for Connect (replacing `businessesApi.list`) hitting the new discovery endpoint with the same filter/search/sort/cursor params
- [x] 6.3 Update the 401 interceptor: when the stored active account is a business account, after `/auth/refresh` (root) call `/accounts/switch` for the active account to re-mint the business token before retrying; on switch failure fall back to personal and clear active account (no infinite retry) ← (verify: 401 while acting as business recovers via refresh→switch→retry; switch failure falls back cleanly)

## 7. Mobile — AuthContext Switch Engine

- [x] 7.1 Run GitNexus impact analysis on `AuthContext.tsx` before editing (HIGH-risk file)
- [x] 7.2 Persist `activeAccountId` durably (AsyncStorage); add `activeAccount` + `accounts` to context state; load accounts via `accountsApi.list()`
- [x] 7.3 Implement `switchAccount(targetId)`: (a) abort with "Hãy kết thúc cuộc gọi trước" if a call is active/ringing; (b) `accountsApi.switch`; (c) tear down current account (unwire local-first, pause outbox, `setCurrentUserId(null)`, `momentsService.setCurrentUserId(null)`, disconnect socket+webrtc, `shutdownDb()`) WITHOUT clearing the root refresh token; (d) set new access token in-memory + persist `activeAccountId`; (e) re-init (`setCurrentUserId(target)`, `momentsService.setCurrentUserId(target)`, `initDb(target)`, `wireLocalFirst()`, reconnect socket+webrtc with new token, re-register FCM context); (f) `setActiveAccount(target)`
- [x] 7.4 Implement `switchBackToPersonal()` as `switchAccount(rootId)`
- [x] 7.5 Update `restoreSession`: refresh root token; if stored `activeAccountId` is a business account, switch into it before initializing local-first state ← (verify: switching A→B tears down A wiring/socket/sql and inits B; dbInit cross-account guard active; no listener leaks; restore reopens last active account; back-to-personal works)

## 8. Mobile — Account List & Create UI

- [x] 8.1 Add `AccountList` route to `ChatApp/src/navigation/PersonalTabStack.tsx` and `navigation/types.ts`; add an entry row in `SettingsScreen` ("Danh sách tài khoản")
- [x] 8.2 Create `AccountListScreen`: list personal + owned business accounts with `verificationStatus` label/badge; selecting an account calls `switchAccount` (subject to call guard); "Thêm tài khoản doanh nghiệp" button
- [x] 8.3 Create the business-create form (reuse the prior CreateBusiness UX: name, category, province, relationshipType, tagline, description, address, contacts) with client-side validation
- [x] 8.4 Wire logo + business-license image upload via existing `mediaApi.requestUploadUrl` flow; submit `accountsApi.createBusiness` with `logoKey` + `licenseImageKey`; new account appears as `pending` ← (verify: form validates required fields; images upload and produce media keys; created account shows as pending in the list; selecting it switches in)

## 9. Mobile — Connect Tab Re-Source

- [x] 9.1 Repoint `ConnectHomeScreen` (and sub-tab lists) to the new account discovery method; keep UI shell, sub-tabs (Đối tác/Nhà cung cấp), province/category filters, sort, search
- [x] 9.2 Update card actions ("Nhắn tin"/"Kết nối") to call `conversationsApi.startDirectChat(businessAccountId)` and navigate to Chat; remove old connect-with-owner logic
- [x] 9.3 Update/replace `BusinessProfileScreen` and `BusinessSearchScreen` to operate on business-account identities; retire `useBusinessList` and old `Business`/`CreateBusinessPayload` types in favor of account-based types ← (verify: Connect lists only verified businesses; tapping Nhắn tin opens chat whose other member is the business account id; filters/search/sort work; no references to removed business directory APIs remain)

## 10. Mobile — Notifications Routing

- [x] 10.1 Keep one device FCM token bound to the root user; update push handling to read `accountId`/`accountType` from the payload
- [x] 10.2 Badge notifications per account; on tap of a notification for a non-active account, call `switchAccount(accountId)` (subject to call guard) then navigate to the target screen ← (verify: payload carries account context; tapping a non-active-account notification switches then navigates; per-account badge distinction visible)

## 11. Remove Old Business Flow (data-safety gated)

- [x] 11.1 Count documents in `businesses` and `businessconnections` collections; if EITHER is non-empty, STOP and surface the counts for a human decision — do NOT drop
- [x] 11.2 If empty/confirmed safe, remove backend `chat-backend/src/businesses/**` (module, controller, service, `business.schema.ts`, `business-connection.schema.ts`, DTOs) and unwire from `AppModule`
- [x] 11.3 Remove mobile `businessesApi`, `hooks/useBusinessList`, obsolete `components/connect/*` no longer used, and old `Business`/`CreateBusinessPayload` types; fix all imports ← (verify: project compiles; no dangling imports to removed business module/types; collections only dropped when empty/confirmed)

## 12. Verification & Checks

- [x] 12.1 Run GitNexus `detect_changes` and confirm only expected symbols/flows are affected
- [x] 12.2 Backend: `cd chat-backend && npm run lint && npm test` — resolve failures in owned scope
- [x] 12.3 Mobile: `cd ChatApp && npm run tsc && npm run lint` — resolve failures in owned scope ← (verify: lint/type/tests pass on both ends; switch, create, discovery, and notification scenarios from the specs are covered)

