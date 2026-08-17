## 1. Foundation — Backend Hardening

- [x] 1.1 Add `escapeRegExp` helper and fix `AdminService.listUsers` search to escape input before `new RegExp(search, 'i')`; add unit test for special chars `.*+?^${}()|[]\`
- [x] 1.2 Unify `PaginationDto` (`page` default 1 `@Min(1)`, `limit` default 20 `@Min(1) @Max(100)`) and migrate `AdminController.listPendingBusinesses`, `listUsers`, `listPending` usage to it
- [x] 1.3 Create `AdminAuditLog` schema (`actorId`, `action`, `targetType`, `targetId`, `payload`, `ip`, `createdAt` index) + `AdminAuditService` + `GET /admin/audit-logs` (paginated, AdminGuard, safe projection)
- [x] 1.4 Wire `AdminAuditService.log()` into every admin mutation: `approveBusiness`, `rejectBusiness`, `bulkApprove/Reject`, `banUser`, `unbanUser`, `softDeleteMessage`, `takedownStory`, `resolve/dismiss report`, commerce CRUD, broadcast
- [x] 1.5 Fix named throttler usage on `AdminController` (`@Throttler({ short: ..., long: ... })` or explicit `@SkipThrottle({ short: false, long: false })`; never bare `@SkipThrottle()`) and add integration test for 429
- [x] 1.6 Add indexes for new admin queries (`AdminAuditLog.createdAt desc`, `Report.status+createdAt`, `Message text index reuse`) ← (verify: specs `admin-audit-log`, `admin-authorization`, `admin-user-management` pagination and search scenarios pass; `npm run lint && npm test` in chat-backend)

## 2. Foundation — Frontend Primitives & Shell Polish

- [x] 2.1 Create FE primitives: `TableShell`, `EmptyState`, `Pagination`, `PageHeader`, `ConfirmDialog`, `SearchInput`, `BulkBar`, unified `StatusBadge` mapping — all using `--koola-*` tokens
- [x] 2.2 Dashboard hierarchy: pending queue card first (with CTA to `/businesses`), metric cards grid, skeletons matching layout, error+retry, live refresh after mutations
- [x] 2.3 Functional topbar search: debounced input that navigates to `GET /admin/users?search=` or `GET /admin/messages/search?q=`; keyboard operable, `aria-label`; remove placeholder span
- [x] 2.4 Business verification polish: bulk select + bulk approve/reject bar, confirmation dialogs with busy state, success toast + list refresh, backdrop-click + ESC + focus trap already in `Dialog` (reuse), per-row action disabled while pending
- [x] 2.5 Users polish: ban dialog with `reason` + optional `durationDays`, reflect `bannedUntil` in detail drawer, bulk ban/unban, search escape handled by BE ← (verify: specs `admin-web-app` primitives/search/bulk scenarios; `admin-web` build+lint pass)

## 3. Moderation — Conversations & Messages + Reports Inbox

- [x] 3.1 BE `GET /admin/conversations` (paginated, optional `search` escaped regex on name/topic, optional `type`) + `GET /admin/conversations/:id` (members + recent messages preview, SAFE_PROJECTION for users) — reuse `ConversationsService`/`MessagesService` as read sources
- [x] 3.2 BE `GET /admin/messages/search` (require `q`, optional `conversationId`, paginated, text index + escaped regex fallback) + `POST /admin/messages/:id/soft-delete` (AdminGuard, soft-delete + `message_deleted` emit via `ChatGateway`, audit-logged) ← (verify: specs `admin-conversation-moderation`, `admin-message-moderation`)
- [x] 3.3 Create `Report` schema + `GET /admin/reports` (filter by `status`/`targetType`, paginated) + `POST /admin/reports/:id/resolve|dismiss` (idempotent, audit-logged)
- [x] 3.4 Seed script `scripts/seed-admin-reports.ts` (≥20 mock reports across targetTypes, idempotent, `seed-` prefix) and run once
- [x] 3.5 FE pages: `ConversationsPage` (list + detail drawer), `MessageSearchPage` (search input + filters + soft-delete confirm), `ReportsPage` (inbox + resolve/dismiss actions, toast + audit refresh) ← (verify: spec `admin-report-inbox`, `messaging` admin trusted delete)

## 4. Moments Moderation

- [x] 4.1 BE `GET /admin/stories` (paginated, optional `authorId`, enriched with author display) + `POST /admin/stories/:id/takedown` (soft-delete/hide, audit-logged, emit story event)
- [x] 4.2 BE `MusicTrack` admin CRUD (`POST|PATCH|DELETE /admin/music-tracks` AdminGuard, audit-logged) + read `GET /admin/music-tracks` + `GET /admin/audience-lists` (paginated)
- [x] 4.3 FE `MomentsModerationPage` (stories table + takedown confirm + preview) and `MusicCatalogPage` (CRUD table + dialog, reuse primitives) ← (verify: specs `admin-moments-moderation`, `moments-stories` takedown)

## 5. Commerce Catalog (Phase 3 — Q1=C)

- [x] 5.1 Create `CommerceModule` with schemas `CommerceProduct` (`name`, `price`, `imageKey`, `category`, `storeId`, `createdAt`), `CommerceStore`, `CommerceService` (+ indexes on `category`, `storeId`)
- [x] 5.2 BE admin CRUD `POST|PATCH|DELETE /admin/commerce/products|services|stores` (AdminGuard, ValidationPipe, audit-logged) + public read `GET /commerce/products` and `GET /commerce/services` (paginated, optional `category`/`storeId` filter, `@Public()`, `Cache-Control`, rate-limited)
- [x] 5.3 Seed script `scripts/seed-commerce-from-mocks.ts` reading `ChatApp/src/screens/shopping/shoppingMockData.ts` and `servicesMockData.ts` (idempotent)
- [x] 5.4 FE `CommerceProductsPage` and `CommerceServicesPage` (tables + create/edit dialogs + image preview via media presigned URL where applicable) ← (verify: spec `admin-commerce-catalog`)
- [x] 5.5 Mobile wiring: `ChatApp` Shopping/Services screens switch from local mock arrays to `GET /commerce/*` (new `commerceApi.ts`), add graceful fallback to local mock on network error, promote `featureAvailability` `shopping`/`services` from `preview` → `ready` ← (verify: `ChatApp` tsc+jest; shopping/services still render when API is down)

## 6. Analytics, Health, Broadcast (Phase 4 — Q3=B)

- [x] 6.1 BE `GET /admin/analytics?range=7d|30d|90d` aggregations (users daily signups, messages daily count, conversations created, stories created, verification funnel) via `$group`/`$bucket`, AdminGuard
- [x] 6.2 BE `GET /admin/health` reuse existing `HealthModule` pings (mongo/redis/minio/coturn) with freshness timestamps, AdminGuard
- [x] 6.3 BE `POST /admin/broadcast` validated `{ title, body }` (class-validator), audit-logged, emits `system_broadcast` via `ChatGateway` (and FCM stub when configured)
- [x] 6.4 FE `AnalyticsPage` (date range selector, SVG sparklines/bars for each series, empty states), `HealthPage` (service status cards with freshness), `BroadcastPage` (form + confirm + success feedback + audit link) — no `recharts`/`chart.js` ← (verify: specs `admin-analytics`, `admin-health-broadcast`)

## 7. Navigation, Tests, Docs & Checks

- [x] 7.1 Expand `admin-web/src/App.tsx` + `AppLayout.tsx` navGroups: `Tổng quan` (Dashboard, Analytics), `Kiểm duyệt` (Conversations, Messages, Moments, Reports), `Catalog` (Products, Services), `Vận hành` (Businesses, Users, Health, Broadcast, Audit log)
- [x] 7.2 Add backend tests: `admin.service.spec.ts` (search escape, pagination bounds), `admin-audit.spec.ts`, `commerce.service.spec.ts`, `report.service.spec.ts`; admin-web tests: primitives + bulk + search + moderation pages
- [x] 7.3 Seed verification: run `seed-admin-reports.ts` + `seed-commerce-from-mocks.ts` and verify `GET /admin/reports`, `GET /commerce/products|services` return seeded data
- [x] 7.4 Final checks: `chat-backend` `npm run lint && npm test`, `admin-web` `npm run build && npm run lint`, `ChatApp` `npx tsc --noEmit && npm test` ← (verify: all checks pass for owned scope; report unowned failures)
