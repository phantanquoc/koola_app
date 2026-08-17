## Why

The current admin-web (shipped 2026-06-17) only covers business verification and user ban with 6 dashboard counters. APP_KOOLA has grown to include conversations, messages, Moments/stories, media, commerce previews, and operational health — but none are manageable from the admin surface. Meanwhile foundational quality gaps remain: unsafe regex search, missing audit trail, no rate limiting, duplicated UI patterns, and a placeholder topbar search. Without a full upgrade, operators cannot moderate content, manage the preview commerce catalog, or observe platform health.

## What Changes

- **Phase 0 — Foundation & optimization (BE + FE):**
  - BE: escape `RegExp` in `AdminService.listUsers`; unify `PaginationDto` (`page`/`limit` validation); add `AdminAuditLog` collection and write on every admin mutation; add named admin throttler (`short`/`long` aware — `@SkipThrottle()` with no args is ineffective); preserve `SAFE_PROJECTION` on all new endpoints.
  - FE: extract reusable primitives (`TableShell`, `EmptyState`, `Pagination`, `PageHeader`, `ConfirmDialog`, unified `StatusBadge`); dashboard hierarchy with pending queue first; skeletons matching layout; inline error + retry; functional topbar search; a11y labels for icon-only controls; bulk approve/reject; ban with reason and optional duration.

- **Phase 1 — Conversation & message moderation + reports:**
  - BE: `GET /admin/conversations` (+ `GET /admin/conversations/:id` with members + recent messages), `GET /admin/messages/search` (cross-conversation text search with index), `POST /admin/messages/:id/soft-delete` (reuses `deleted`/`deletedFor` semantics via trusted actor, emits `message_deleted`); `Report` schema + `GET /admin/reports` + `POST /admin/reports/:id/resolve|dismiss`.
  - FE: Conversations list/detail, message search, Reports inbox; seed mock reports until mobile report entry exists.

- **Phase 2 — Moments moderation:**
  - BE: `GET /admin/stories` (+ takedown/soft-delete), `MusicTrack` admin CRUD, `AudienceList` read; reuse existing `MomentsService`/`MediaService`.
  - FE: Moments moderation page + music catalog page.

- **Phase 3 — Commerce catalog (Q1=C):**
  - BE: new `CommerceModule` with `Product`/`Store`/`Service` schemas + admin CRUD (`/admin/commerce/*`) + public read `GET /commerce/products` and `GET /commerce/services` (paginated, cached); seed from `ChatApp/src/screens/shopping/shoppingMockData.ts` and `servicesMockData.ts`.
  - FE: admin CRUD pages for products/services; mobile wiring: `ChatApp` Shopping/Services switch from local mock to API and `featureAvailability` `shopping`/`services` move `preview` → `ready` as final step.

- **Phase 4 — Analytics, health, broadcast (Q3=B):**
  - BE: `GET /admin/analytics` (real aggregations: user growth, message/conversation/story activity, verification funnel), `GET /admin/health` (mongo/redis/minio/coturn pings via existing `HealthModule`), `POST /admin/broadcast` (socket system event; FCM when configured).
  - FE: Analytics page with lightweight SVG charts (no heavy chart deps), Health page, Broadcast page.

- **Cross-cutting:** OpenSpec specs for every new capability; tests for new services and admin-web pages; lint/build checks.

## Capabilities

### New Capabilities
- `admin-audit-log`: admin mutation audit trail (collection, write hook, read endpoint).
- `admin-conversation-moderation`: list/search/detail of conversations for operators.
- `admin-message-moderation`: cross-conversation message search and trusted soft-delete.
- `admin-report-inbox`: user report lifecycle (create via seed/mock, list, resolve/dismiss).
- `admin-moments-moderation`: story takedown and moments catalog reads.
- `admin-commerce-catalog`: commerce product/service/store admin CRUD and public read APIs.
- `admin-analytics`: real platform analytics aggregations.
- `admin-health-broadcast`: health probes and operator broadcast.

### Modified Capabilities
- `admin-authorization`: add named admin throttler handling and audit integration.
- `admin-business-verification`: bulk operations and richer lifecycle (reason templates already exist, extend with batch).
- `admin-user-management`: regex escaping, pagination unification, ban with reason/duration.
- `admin-web-app`: shell primitives, functional search, bulk actions, new navigation groups (Moderation, Catalog, Ops), analytics/health/broadcast screens.
- `messaging`: trusted admin soft-delete path (distinct from user delete ownership rule).
- `moments-stories`: admin takedown path.

## Impact

- **chat-backend/src/admin/** — extended with 15+ endpoints, audit log, report, moments-commerce bridges; new `commerce/` module; new schemas (`AdminAuditLog`, `Report`, `CommerceProduct`, `CommerceService`, `CommerceStore`).
- **chat-backend/src/** — conversation/message/moments modules reused as read sources; `HealthModule` reused; gateway reused for broadcast.
- **admin-web/src/** — 8+ new pages, 5+ primitives, expanded `AppLayout` nav, `apiClient` admin throttler awareness, new service hooks.
- **ChatApp/src/** — Shopping/Services screens switch from local mock to API; `featureAvailability` promotion.
- No RBAC beyond `isPlatformAdmin`, no E2EE content access, no hard-delete, no MUI/AntD migration, no mobile report UI (mock reports).
