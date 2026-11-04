> **HANDOFF — tiếp tục từ đây (cập nhật 2026-10-30)**
>
> Trạng thái: backend xong, mobile UI xong code; **CHƯA commit, CHƯA test trên máy thật.**
>
> Đã kiểm chứng:
> - Backend `tsc -p tsconfig.build.json` sạch. `jest`: 697 pass / 1 fail — fail duy nhất là `commerce.service.spec.ts` (`getSellerStorefront`), có sẵn từ trước, file không bị đụng.
> - Spec mới, tất cả xanh: `business-members.service.spec` · `business-invites.service.spec` · `business-sessions.service.spec` · `business-audit-logs.service.spec` · `business-members-http.spec` (22) · bổ sung `accounts.service.spec` / `auth.service.spec` / `commerce-orders.service.spec`.
> - Mobile `tsc`: 4 lỗi còn lại đều ở file KHÔNG đụng tới (`ShoppingTabStack.tsx` `text.secondary` ×2, `momentsTextWarning.spec`, `shoppingHeaderDefer.test`). `jest`: 1576 pass / 30 fail / 7 suite — tất cả có sẵn (đã xác nhận `AuthContext→RootNavigator→MainNavigator→blur` có từ HEAD).
> - `business-session.guard.spec.ts` — 11 test xanh (personal / không header / không row / cùng device pass; khác device → 401 `BUSINESS_SESSION_ENDED`; skip decorator; ws; id lỗi). Toàn bộ `src/business-members` + `src/common/guards`: 97/97.
> - 17.2 xong code: `businessTapRoute.spec.ts` 8/8; mobile `tsc` vẫn đúng 4 lỗi baseline.
>
> Việc tiếp theo, theo thứ tự:
> 1. ~~guard spec~~ ✅ · 2. ~~17.2~~ ✅
> 3. ~~19.6 i18n~~ — user chốt: NGOÀI PHẠM VI, giữ VN-only, làm i18n ở change riêng sau. (dòng cũ:) 19.6 i18n: app chưa có hệ thống i18n — mọi copy hiện là tiếng Việt cứng. Cần quyết định với user: thêm thư viện hay giữ VN-only.
> 4. Device test (nhóm 20) trên 2 máy — xem [[project_android_build_variants]], dùng build **perf**, không release.
> 5. Docs (nhóm 21), rồi `detect_changes` → commit → archive.
>
> Bị chặn (cần user quyết): 2.3–2.5, 4.4–4.6, 9.3–9.5, 9.8, 16.4–16.6 — **không có endpoint/FAB bán hàng cho business** (mọi thao tác ghi sản phẩm là route admin). Cần một màn "người bán tự quản sản phẩm" thì mới gate/audit được.
>
> - Nhóm 21 docs xong: `docs/business-members.md` + mục mới trong `CLAUDE.md`. Còn lại: nhóm 20 (device test) → `detect_changes` → commit → archive.
>
> Sửa lỗi phát hiện trong lúc làm (đáng biết khi review):
> - **Bảo mật — lỗ hổng xuyên business:** `BusinessRoleGuard` chỉ xét `role` trong JWT mà không so `:id` trên URL với business đang switch → owner business A gọi `/businesses/<B>/members/...` là đổi role/xoá thành viên/đọc audit log của B. Thêm kiểm tra tenant scope trong guard (403 `Not acting as this business`). Đồng thời `GET /businesses/:id/members` trước đó KHÔNG có guard nào (ai đăng nhập cũng đọc được tên+email thành viên của mọi business) → thêm `@BusinessRole('viewer')`. 11 test HTTP mới trong `business-members-http.spec.ts`.
> - Link mời dùng `app://` → không máy nào mở được. Đã đổi sang `koola://invite`.
> - Giới hạn 1 thiết bị chỉ là hình thức (không ai đọc `business_sessions`) → thêm `BusinessSessionGuard`.
> - `listAccounts` liệt kê business sở hữu **2 lần** sau lazy migration + N+1 query → đã sửa.
> - 5 task "unit test" được tick nhưng không có file test nào → đã bỏ tick rồi viết thật.

## 1. Backend Schema & Migrations

- [x] 1.1 Create `business_members` schema with fields: businessId, userId, role, invitedBy, joinedAt, status, lastActiveAt
- [x] 1.2 Add compound unique index on (businessId, userId) to business_members
- [x] 1.3 Add index on userId for "list businesses I'm a member of" query
- [x] 1.4 Create `business_invites` schema with fields: businessId, email, role, token, invitedBy, createdAt, expiresAt, status
- [x] 1.5 Add index on token for invite verification lookup
- [x] 1.6 Add index on (businessId, status) for listing pending invites
- [x] 1.7 Create `business_sessions` schema with fields: businessId, userId, deviceId, deviceModel, osVersion, appVersion, createdAt, lastActiveAt
- [x] 1.8 Add compound unique index on (businessId, userId) for device limit enforcement
- [x] 1.9 Add index on deviceId for session lookup
- [x] 1.10 Create `business_audit_logs` schema with fields: businessId, actorId, eventType, resourceId, changes, metadata, deviceId, createdAt
- [x] 1.11 Add compound index on (businessId, createdAt) for time-range queries
- [x] 1.12 Add index on eventType for filtered queries
- [x] 1.13 Add TTL index on createdAt with 90-day expiry for auto-deletion ← (verify: all schemas valid, indexes created, TTL works)

## 2. Backend Lazy Migration Logic

- [x] 2.1 Add helper function `ensureOwnerMembership(businessId)` that creates owner membership if none exists
- [x] 2.2 Call `ensureOwnerMembership` in AccountsService.switchAccount before issuing token
- [ ] 2.3 Call `ensureOwnerMembership` in CommerceController POST endpoints — NOT APPLICABLE: `CommerceController` is read-only/public (catalog browse). Every catalog write lives on `AdminCommerceController` (`admin/commerce/*`, `AdminGuard`), which acts as a platform admin, not as the business. Lazy migration already runs on the one path a business owner actually takes: `AccountsService.switchAccount` (2.2)
- [ ] 2.4 Call `ensureOwnerMembership` in ServicesController POST endpoints — NOT APPLICABLE: no `ServicesController` exists; service writes are `AdminCommerceController.createService/updateService/deleteService`. Same reasoning as 2.3
- [ ] 2.5 Call `ensureOwnerMembership` in ConnectionsController POST endpoints — NOT APPLICABLE: no `ConnectionsController` exists. Business posts go through `MomentsController`, which is author-scoped, not business-scoped
- [x] 2.6 Handle duplicate key error (11000) as success (idempotent operation) ← (verify: existing business owners auto-migrate on first action, no errors)

## 3. Backend JWT & Auth Extensions

- [x] 3.1 Extend JwtPayload interface with optional `role` field
- [x] 3.2 Update JwtStrategy.validate to extract and return `role` from payload (default "owner" if missing)
- [x] 3.3 Update AuthService.mintAccessToken to accept optional `role` parameter
- [x] 3.4 Extend CurrentUser decorator return type to include `role` field ← (verify: JWT contains role claim, guards receive role in request.user)

## 4. Backend Permission Guards

- [x] 4.1 Create `BusinessRole` decorator accepting role array (e.g., `@BusinessRole(['owner', 'admin'])`)
- [x] 4.2 Create `BusinessRoleGuard` that reads decorator metadata and checks request.user.role
- [x] 4.3 Return 403 with descriptive message if role insufficient
- [ ] 4.4 Apply guard to CommerceController POST/PUT/DELETE methods (require "editor" minimum) — BLOCKED, same cause as 2.3: there is no business-facing catalog write endpoint to guard. `CommerceController` has no mutating route (only `POST products/validate`, a public read); catalog writes are admin-only under `AdminGuard`. Unblock by adding seller-facing product routes, then applying `@BusinessRole('editor')`. Mirrored on mobile by 16.4-16.6 (no create FAB exists either)
- [ ] 4.5 Apply guard to ServicesController POST/PUT/DELETE methods (require "editor" minimum) — BLOCKED: no `ServicesController`; see 4.4
- [ ] 4.6 Apply guard to ConnectionsController POST/PUT/DELETE methods (require "editor" minimum) — BLOCKED: no `ConnectionsController`; see 4.4
- [x] 4.7 Create GET /permissions/matrix endpoint returning full permission matrix
- [x] 4.8 Create GET /permissions/check?role=X&action=Y endpoint ← (verify: personal users get 403 on POST /commerce/products, editors can post, viewers cannot)

## 5. Backend Member Management Module

- [x] 5.1 Create `BusinessMembersModule` with service, controller
- [x] 5.2 Implement GET /businesses/:id/members (list members) — check caller is member
- [x] 5.3 Implement PUT /businesses/:id/members/:userId/role (change role) — require admin+, prevent self-change, prevent last-owner demotion
- [x] 5.4 Implement DELETE /businesses/:id/members/:userId (remove member) — require admin+, prevent self-removal, prevent last-owner removal
- [x] 5.5 Invalidate removed member's sessions on removal
- [x] 5.6 Add unit tests for membership CRUD operations — `business-members.service.spec.ts`: lazy migration (incl. 11000 idempotency), self-change/self-removal blocks, last-owner protection on both demote and remove, session invalidation + audit on removal, owner-notification rules ← (verify: member list shows all members with roles, role changes work, last owner protected)

## 6. Backend Invite Flow Module

- [x] 6.1 Create `BusinessInvitesModule` with service, controller
- [x] 6.2 Implement POST /businesses/:id/invites (create invite) — require admin+, validate email, check not existing member
- [x] 6.3 Generate JWT token with 7-day expiry containing (businessId, email, role, invitedBy)
- [x] 6.4 Send invite email via Nodemailer with deep link — **scheme corrected to `koola://invite?token={jwt}`**. The proposal's `app://` was claimed by nothing (AndroidManifest registers `koola`, and React Navigation's `linking.prefixes` is `koola://`), so every invite email shipped a link no device could open. `INVITE_LINK_PREFIX` in business-invites.service.ts is now the single source, used by create AND resend
- [x] 6.5 Implement GET /invites/verify?token=X (validate token without accepting)
- [x] 6.6 Implement POST /invites/accept (accept invite) — verify token, create membership, mark invite accepted
- [x] 6.7 Implement GET /businesses/:id/invites (list pending invites) — require admin+
- [x] 6.8 Implement DELETE /invites/:id (revoke invite) — require admin+, prevent revoke if already accepted
- [x] 6.9 Implement POST /invites/:id/resend (resend email) — require admin+, check not expired/accepted
- [x] 6.10 Add unit tests for invite lifecycle — `business-invites.service.spec.ts`: create (token payload, email lowercasing, duplicate/member conflicts, email-failure still returns the invite), verify (bad token / revoked / stored-expiry), accept (email binding, idempotent re-accept), list / revoke / resend ← (verify: invite created, email sent, token validates, accept creates membership)

## 7. Backend Account Switching Extensions

- [x] 7.1 Update AccountsService.listAccounts to query business_members collection for caller
- [x] 7.2 Include member businesses in response with role + ownerUserId fields
- [x] 7.3 Populate owner displayName for member businesses
- [x] 7.4 Update AccountsService.switchAccount to check business_members if not owner
- [x] 7.5 Load member role from business_members and include in JWT
- [x] 7.6 Return 403 if membership status is "suspended"
- [x] 7.7 Add unit tests for member account switching — in `accounts.service.spec.ts`: member switch mints `role` in the JWT, suspended membership 403s, lazy migration runs before minting, device session created only when a deviceId is sent (+ forcedLogout surfaced). Also covers a real bug found while testing: an owned business whose owner-membership row exists appeared TWICE in `listAccounts` ← (verify: member sees businesses they joined, switch works with correct role in JWT)

## 8. Backend Device Session Module

- [x] 8.1 Create `BusinessSessionsModule` with service, controller
- [x] 8.2 Implement session creation on AccountsService.switchAccount (business accounts only)
- [x] 8.3 Check for existing session with different deviceId — if found, delete old session
- [x] 8.4 Extract deviceId from X-Device-ID header (required for business operations)
- [x] 8.5 Send push notification to old device on force logout — `NotificationsService.sendForcedLogoutPush`, called from `BusinessSessionsService.createOrReplaceSession` (every eviction path, not just the switch endpoint). Skips the `isOnline` gate the message pushes use: the evicted device is usually still "online", and it is the one that must hear about it
- [x] 8.6 Implement GET /businesses/:id/sessions (list active sessions) — require admin+
- [x] 8.7 Implement DELETE /businesses/:id/sessions/:sessionId (force logout) — require admin+, prevent self-logout
- [x] 8.8 Update session lastActiveAt on every business API call — global `BusinessSessionActivityInterceptor` (APP_INTERCEPTOR in app.module). Runs after the response so a rejected request is not activity; no-op for personal sessions
- [x] 8.9 Delete session on explicit logout or account switch — `AuthService.logout` deletes the actor's `business_sessions` rows (switch already replaces them via `createOrReplaceSession`). AuthModule registers the schema rather than importing BusinessMembersModule, to avoid a cycle through the module everything imports
- [x] 8.10 Add unit tests for device limit enforcement — `business-sessions.service.spec.ts` (first device, eviction + push, same-device refresh, metadata, self-logout block, 404 paths) ← (verify: 2nd device login force-logs-out 1st device, push notification sent)

## 9. Backend Audit Log Module

- [x] 9.1 Create `BusinessAuditLogsModule` with service, controller
- [x] 9.2 Create helper `auditLog(businessId, actorId, eventType, resourceId, changes, metadata, deviceId)` function
- [ ] 9.3 Instrument CommerceController: product.created, product.updated, product.deleted — BLOCKED, same cause as 2.3/4.4: product writes are platform-admin routes (`AdminCommerceController` + `AdminGuard`), already logged to `admin_audit` by `AdminAuditService`. Logging them as *business* events would attribute a Koola staff action to the shop. Unblocks when seller-facing product routes exist
- [ ] 9.4 Instrument ServicesController: service.created, service.updated, service.deleted — BLOCKED: no `ServicesController`; service writes are admin routes. See 9.3
- [ ] 9.5 Instrument ConnectionsController: post.created, post.updated, post.deleted — BLOCKED: no `ConnectionsController`. Business posts go through `MomentsController`, which is author-scoped (a post belongs to a user, not to a business), so there is no businessId to log against
- [x] 9.6 Instrument OrdersController: order.status_changed, order.cancelled, order.refunded — `OrdersService.auditOrderEvent` on confirm / reject / ship / receive / cancel. Always logged against the SELLER's business (a buyer-side cancel changed the seller's order), with `actedAs: seller|buyer` in metadata and `act ?? sub` as the actor. The auto-deliver cron writes nothing — `actorId` is a required user ref and there is no human to name. No `order.refunded` event: refunds do not exist in the order state machine yet (D6 has no REFUNDED status)
- [x] 9.7 Instrument BusinessMembersController: member.invited, member.role_changed, member.removed
- [ ] 9.8 Instrument BusinessesController: business.settings_changed, business.deleted — BLOCKED: no `BusinessesController` and no business-settings or delete-business endpoint exists. A business profile is a `User` row edited through `PUT /users/me` while switched in, and nothing deletes a business account. Unblocks with a real business-settings surface
- [x] 9.9 Implement GET /businesses/:id/audit-logs with filters (startDate, endDate, eventType, actorId) — require admin+
- [x] 9.10 Implement pagination for audit log queries
- [x] 9.11 Send push notifications to owners for sensitive events (member.removed, member.role_changed to owner, business.deleted) — `notifyOwnersOfSensitiveEvent` pushes to every owner EXCEPT the actor (a push telling you what you just did is noise). Covers `member.removed` and promotion *to* owner; routine role changes stay audit-log-only. `business.deleted` has no endpoint to hook (see 9.8)
- [x] 9.12 Add unit tests for audit logging — `business-audit-logs.service.spec.ts`: write payload, failure is swallowed (an audited action must not roll back), pagination skip, date-range/eventType/actor filters, public row shape ← (verify: events logged with correct metadata, query filters work, TTL expiry after 90 days)

## 10. Backend Integration Tests

Done as HTTP-boundary tests in `business-members-http.spec.ts` (22 tests): real
controllers + real `BusinessRoleGuard` + the global ValidationPipe, with services
mocked. That is the layer where these guarantees live — role→status mapping and
route wiring — and it needs no live Mongo/Redis, so it runs in CI with the rest
of the suite. The product-write half of 10.1/10.5/10.6 is not testable yet: no
seller-facing product endpoint exists (see 4.4).

- [x] 10.1 E2E test: owner invites editor, editor accepts, editor creates product, audit log records it — invite→accept covered (owner/admin 201, accept uses the signed-in user id not the active account); audit-log read is admin-only. Product-create leg blocked by 4.4
- [x] 10.2 E2E test: admin changes member role from editor to viewer, member loses create permission — admin 200 on the role route, editor 403, unknown role 400
- [x] 10.3 E2E test: owner removes member, member loses access to business in account list — owner 200 / viewer 403 on removal; the "disappears from the list" half is `accounts.service.spec.ts` (listAccounts reads only active memberships)
- [x] 10.4 E2E test: member logs in from 2 devices, 1st device force-logged-out — eviction + push asserted in `business-sessions.service.spec.ts`; the HTTP spec covers admin-only listing and that the caller id reaches the service so self-logout is blocked
- [x] 10.5 E2E test: viewer attempts to create product, receives 403 — asserted on every admin+ write route (invite, role change, remove, sessions, audit logs). Product route blocked by 4.4
- [x] 10.6 E2E test: personal user attempts to POST /commerce/products, receives 403 — covered as "personal account 403s on a business route even with a role header" (BusinessRoleGuard's `accountType` gate). Product route blocked by 4.4 ← (verify: all critical flows work end-to-end)

## 11. Mobile Device ID Generation

- [x] 11.1 Create `DeviceIdService` utility
- [x] 11.2 On first launch, generate UUID and store in AsyncStorage under key "deviceId"
- [x] 11.3 Export `getDeviceId()` function that reads from AsyncStorage (never regenerates)
- [x] 11.4 Add deviceId to `apiService` default headers as X-Device-ID
- [x] 11.5 Include device model, OS version, app version in session metadata ← (verify: deviceId persists across app restarts)

## 12. Mobile Auth Context Extensions

- [x] 12.1 Extend `Account` interface with optional `role` and `ownerUserId` fields
- [x] 12.2 Update `accountsApi.list()` to parse member businesses from response
- [x] 12.3 Display owner displayName for member businesses in account switcher — data plumbed (`Account.ownerDisplayName` + `isMember` parsed in `accountsApi.list()`) and now rendered as the "Sở hữu bởi [tên]" subtitle in AccountListScreen (see 13.3)
- [x] 12.4 Update `switchAccount` to handle member businesses (not just owned)
- [x] 12.5 Parse `role` from JWT and store in AuthContext state
- [x] 12.6 Add `hasRole(requiredRole)` helper for UI permission checks ← (verify: account switcher shows member businesses with role badges)

## 13. Mobile Account Switcher UI

- [x] 13.1 Update `AccountSwitcherModal` to group accounts: "Your Accounts" (owned) vs "Member Accounts" (joined) — implemented in `AccountListScreen` (the real switcher surface; no `AccountSwitcherModal` exists). `groupAccounts()` splits personal/owned/member; headers "Tài khoản của bạn" / "Tài khoản thành viên" are omitted when their group is empty, personal root stays first and ungrouped
- [x] 13.2 Add role badge component showing owner/admin/editor/viewer icon + label — `components/business/RoleBadge.tsx`, semantic tokens only, labels from `BUSINESS_ROLE_LABEL`
- [x] 13.3 Show "Owned by [Name]" subtitle for member businesses — "Sở hữu bởi [tên]" from `ownerDisplayName`, member rows only
- [x] 13.4 Add verification status badge (verified/pending/rejected) for all businesses — `KoolaBadge` with `VERIFICATION_TONE` (success/warning/danger); business accounts only, since personal accounts have no verification lifecycle
- [x] 13.5 Show member count for owned businesses (e.g., "3 members") — backend `BusinessMembersService.countActiveMembers` (ONE `$group` aggregate) → `memberCount` on owned rows of `GET /accounts`; mobile `Account.memberCount` → "N thành viên" in AccountListScreen (hidden when 1 = owner alone). listAccounts was also de-N+1'd (batched business + owner lookups)
- [x] 13.6 Add "Create Business Account" button at bottom ← (verify: UI matches wireframe from flow diagram) — "Tạo tài khoản kinh doanh" at list bottom, wired to the existing embedded `CreateBusinessForm` flow (no new screen/route)

## 14. Mobile Member Management Screens

- [x] 14.1 Create `ManageMembersScreen` with member list, invite button (owner/admin only) — `screens/business/ManageMembersScreen.tsx`, route `PersonalTab › ManageMembers`
- [x] 14.2 Create `MemberListItem` component showing avatar, name, role, device status (online/offline), last active — `components/business/MemberListItem.tsx`; "online" = `lastActiveAt` within 5 min (device session, not chat presence)
- [x] 14.3 Add member actions menu (change role, remove) with confirmation dialogs — KoolaMenu + koolaConfirm; no menu on the self row (backend 400s self-change)
- [x] 14.4 Create `InviteMemberScreen` with email input, role picker (admin/editor/viewer) — `screens/business/InviteMemberScreen.tsx`
- [x] 14.5 Add form validation (valid email, not existing member) — local shape + member-email check; duplicate pending invite stays server-side (409, translated)
- [x] 14.6 Show pending invites section with "Resend" and "Revoke" actions
- [x] 14.7 Create `RolePicker` component with radio buttons + role descriptions — `components/business/RolePicker.tsx`; `accessibilityRole="radio"` rows with a one-line capability description per role (`ROLE_DESCRIPTION`, derived from `PERMISSION_MIN_ROLE`). Generic over the role union so the invite form passes `InvitableRole[]` and can never emit `owner` ← (verify: owner can invite, change roles, remove members; editors see 403 on invite)

## 15. Mobile Invite Flow

- [x] 15.1 Register deep link handler for `koola://invite?token=X` (scheme corrected from `app://`, see 6.4) — `navigation/inviteLinking.ts`, merged into RootNavigator's linking config at the `Main` level so Moments links survive
- [x] 15.2 Create `AcceptInviteScreen` with business name, inviter name, role display — `screens/business/AcceptInviteScreen.tsx`
- [x] 15.3 If not logged in, redirect to LoginScreen with `returnTo` param preserving token — implemented as `navigation/pendingInviteStore.ts` + `usePendingInviteLink` in RootNavigator instead of a `returnTo` param: with conditional auth screen groups the AcceptInvite route does not exist while signed out, so the token is parked in memory and replayed after login
- [x] 15.4 After login/register, call `POST /invites/accept` with token
- [x] 15.5 On success, show "Welcome to [Business]" with role capabilities — capabilities card before accepting + welcome toast after (toast, not a modal: the app then switches into the business, which is the real "welcome")
- [x] 15.6 Refresh account list to include new business — new `AuthContext.refreshAccounts()`, called before `switchAccount` so the target resolves
- [x] 15.7 Handle errors: expired token, already accepted (auto-switch to business), wrong email (warned before tapping) ← (verify: email link opens app, accept creates membership, business appears in account list) — NOT device-verified yet

## 16. Mobile Permission Gates

- [x] 16.1 Create `PermissionGate` HOC accepting required role + children
- [x] 16.2 Hide children if user role insufficient (e.g., FAB "Create Product" only for editor+)
- [x] 16.3 Create `useBusinessPermissions()` hook returning permission check functions
- [ ] 16.4 Apply gate to FAB in ShoppingHomeScreen (editor+ only) — BLOCKED: no create FAB exists on this screen (buyer-facing catalog; header has only orders + cart). Nothing to gate without inventing a product-composer screen.
- [ ] 16.5 Apply gate to FAB in ServicesHomeScreen (editor+ only) — BLOCKED: screen exists but has no create FAB (mock data, header actions are coming-soon placeholders).
- [ ] 16.6 Apply gate to FAB in ConnectionsHomeScreen (editor+ only) — BLOCKED: no ConnectionsHomeScreen; closest is ConnectHomeScreen (business discovery), which has no create FAB.
- [x] 16.7 Apply gate to "Invite Members" button in settings (admin+ only) — SettingsScreen shows a "Thành viên" card only in a business session; devices + audit rows are `canManageMembers`-gated; the invite button inside ManageMembers is `canInviteMembers`-gated
- [x] 16.8 Show explanation if permission insufficient — InviteMember / ActiveSessions / AuditLog render `explain(...)` copy instead of a blank screen when reached without the role. (The FAB-tap toast variant still waits on 16.4-16.6.) ← (verify: viewer sees no FAB, editor sees FAB, personal user sees "Register business account" prompt)

## 17. Mobile Session Management

- [x] 17.1 Handle 401 response with "Session ended" message — needed a BACKEND fix first: eviction was cosmetic (nothing read `business_sessions`, so an evicted device kept working). Added global `BusinessSessionGuard` (401 `BUSINESS_SESSION_ENDED` when the row names another device; exempt `/accounts/switch` + `/auth/logout` via `@SkipBusinessSessionCheck`). Mobile: apiService detects the marker and does NOT refresh (that would re-evict the winner → ping-pong); AuthContext drops back to personal and App.tsx shows a dialog
- [x] 17.2 Show push notification when force-logged-out by new device — backend sends it (8.5, `type: business_session_ended`). Mobile tap routing: `pushNotificationService` parks `business_session_ended` / `business_event` taps; rules in pure `services/push/businessTapRoute.ts` (+ spec, 8 tests): session-ended acts ONLY on the device named in `evictedDeviceId` (the push also reaches the winning device) and never switches INTO the business (would re-evict the winner) — drop to personal if still active there, then dialog; `business_event` switches into the business and opens AuditLog (stops if the switch fails, so it never shows another account's log). Also fixed: taps that resume an already-signed-in app were never consumed (effect only ran on `isAuthenticated` change) → new `onPendingNotificationTap` listener. NOT device-verified
- [x] 17.3 Create `ActiveSessionsScreen` — `screens/business/ActiveSessionsScreen.tsx`, marks "Thiết bị này" via `getDeviceId()`
- [x] 17.4 Add "Force Logout" action for admins on other members' sessions — hidden on own device (backend 400s self-logout, now enforced)
- [x] 17.5 Update session lastActiveAt on app foreground — covered by 8.8: the global interceptor touches it on every business call, and the foreground reconnect already makes business calls; no separate ping endpoint needed ← (verify: force logout works, notification received on old device) — NOT device-verified yet

## 18. Mobile Audit Log UI

- [x] 18.1 Create `AuditLogScreen` with filterable event list (owner/admin only) — `screens/business/AuditLogScreen.tsx`
- [x] 18.2 Create `AuditLogItem` component — `components/business/AuditLogItem.tsx`; event glyph badged on the actor avatar; copy in `screens/business/auditEvents.ts`
- [x] 18.3 Add filter controls — event-type menu, member menu, date presets (7/30/90 ngày) instead of a free date-range picker (no date-picker dependency in the project; presets cover the real use)
- [x] 18.4 Implement pagination with infinite scroll — FlatList `onEndReached`, page-based (what the API offers), in-flight guard
- [x] 18.5 Show event details modal on tap — KoolaDialog with actor, time, summary, device, resource, raw `changes`
- [x] 18.6 Highlight sensitive events — danger-tinted badge + label for removal / role change / deletions ← (verify: audit log shows all business actions with correct actor attribution) — NOT device-verified yet

## 19. Mobile UI Polish

- [x] 19.1 Add loading states for invite acceptance, member list, role changes — `KoolaLoadingState` on every screen; per-row `busyId` + button `loading` during role change / remove / resend / force-logout
- [x] 19.2 Add empty states: "No members yet", "No pending invites", "No audit logs" — `KoolaEmptyState` in ManageMembers (members + invites), ActiveSessions, AuditLog (separate copy when filters match nothing)
- [x] 19.3 Add error states with retry buttons for failed API calls — `KoolaErrorState` + `onRetry` on all list screens; server reasons translated via `screens/business/businessErrors.ts`
- [x] 19.4 Add success toasts: "Member invited", "Role changed", "Member removed" — plus revoke / resend / force-logout / accept
- [x] 19.5 Add confirmation dialogs for destructive actions (remove member, revoke invite) — `koolaConfirm` (destructive), also on force-logout
- [ ] 19.6 Ensure all text uses i18n (Vietnamese + English support) — OUT OF SCOPE (user decision): the app has no i18n system; every screen is hard-coded Vietnamese. Kept VN-only here; adding i18n is app-wide and belongs to its own future change ← (verify: all states handled gracefully, no blank screens)

## 20. Mobile Device Testing

- [ ] 20.1 Test invite flow end-to-end on 2 physical devices (Android + iOS)
- [ ] 20.2 Test device limit: login from device B force-logs-out device A
- [ ] 20.3 Test role permissions: viewer cannot create product, editor can
- [ ] 20.4 Test member removal: removed member loses business in account list immediately
- [ ] 20.5 Test offline queue: invite acceptance queued offline, sent on reconnect
- [ ] 20.6 Test account switching: member can switch between personal, owned, and member businesses ← (verify: all critical flows work on real devices, no regressions)

## 21. Documentation

- [x] 21.1 Update `docs/business-accounts-flow.md` with member system architecture — architecture lives in new `docs/business-members.md` §1 (guards order, collections, mobile pieces); `business-accounts-flow.md` got a pointer header
- [x] 21.2 Document permission matrix in `docs/permissions.md` — placed in `docs/business-members.md` §2 instead of a separate file (matrix + per-route enforcement + what is NOT enforced yet)
- [x] 21.3 Add API examples for invite flow to Postman collection — no Postman collection exists in the repo; added runnable curl examples in `docs/business-members.md` §3 instead
- [x] 21.4 Update `CLAUDE.md` with member system patterns (lazy migration, role guards, device sessions) — new "Business Members" section
- [x] 21.5 Create migration guide for existing businesses (auto-migration on first action) — `docs/business-members.md` §5
- [x] 21.6 Document audit log event types and query patterns ← (verify: docs accurate, examples runnable) — `docs/business-members.md` §6; facts checked against code (field names, filters, limits). curl examples NOT executed against a live server
