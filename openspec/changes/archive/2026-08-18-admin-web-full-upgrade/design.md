## Context

Admin-web shipped 2026-06-17 with 3 pages (Dashboard, Businesses pending, Users) and 9 `/admin/*` endpoints guarded by `AdminGuard` (actor-based `act ?? sub` + fresh DB load of `isPlatformAdmin`). The shell and API client are functional, but:
- Foundation quality gaps: `AdminService.listUsers` builds `new RegExp(search, 'i')` without escaping (ReDoS / unexpected match), pagination DTO is ad-hoc, no audit trail for high-impact mutations, named throttlers (`short`/`long` in `app.module.ts:ThrottlerModule`) make bare `@SkipThrottle()` ineffective (silent bug noted in memory `coturn-lan-health-fix`), and no unified error/loading/empty patterns in FE.
- Feature gaps: operators cannot inspect conversations/messages, moderate Moments, manage the preview commerce catalog (Shopping/Services are `preview` per `featureAvailability.ts` with no BE module), or observe analytics/health. Reports and broadcast do not exist yet.
- Stakeholders: internal operators (single `isPlatformAdmin` role; audit log suffices for accountability); mobile team (needs commerce API to graduate preview → ready); backend team (reuse existing conversation/message/moments/health modules as read sources).

Existing specs `admin-authorization`, `admin-business-verification`, `admin-user-management`, `admin-web-app` define the baseline.

## Goals / Non-Goals

**Goals:**
- Harden foundation: safe search, consistent pagination, audit, throttling, and FE primitive consolidation before expanding scope.
- Provide moderation surfaces for conversations, messages, and Moments (read/search/takedown) with mock reports seeding.
- Provide commerce catalog management (admin CRUD + public read) and migrate mobile Shopping/Services from local mock to API.
- Provide real analytics/health aggregations and operator broadcast.
- Keep app principles intact: stateless BE, layer separation, `SAFE_PROJECTION`, socket fanout via existing gateways.

**Non-Goals:**
- RBAC beyond `isPlatformAdmin` (audit log covers who did what; roles deferred).
- E2EE content access or decrypting message content beyond stored plaintext search.
- Hard deletes (use soft-delete `deleted`/`deletedFor`/`deletedAt` patterns already in schemas).
- Mobile report submission UI (seed mock reports; mobile can add later).
- Migrating admin-web to MUI/AntD or adding heavy chart deps (use token-coherent CSS + lightweight SVG sparklines).

## Decisions

### D1: Escape RegExp and use indexed search correctly
**Decision:** In `AdminService.listUsers`, escape user input via `escapeRegExp` before constructing the case-insensitive regex; for message search, use the existing MongoDB text index (`message.schema` `content`) where possible and fall back to escaped regex only for small admin-scoped queries. Add compound indexes for new admin query patterns (`createdAt` desc on conversations, `conversationId+createdAt` already exists).
**Why:** Prevents ReDoS and over-broad matches. `user-search` spec already uses escaped regex in the public API — align admin with that pattern.
**Alternative:** Use Atlas Search — rejected, local deployment has no Atlas.

### D2: Unified PaginationDto
**Decision:** Single `PaginationDto` with `@IsInt @Min(1)` `page` (default 1) and `@IsInt @Min(1) @Max(100)` `limit` (default 20) validated via `ValidationPipe`. All admin list endpoints extend it.
**Why:** Consistency for FE `TableShell`/`Pagination` and Swagger docs. Existing `PaginationDto` already exists — extend rather than duplicate.
**Alternative:** Cursor pagination everywhere — rejected, admin lists are small and page/limit is already the convention.

### D3: AdminAuditLog collection
**Decision:** New `AdminAuditLog` schema (`_id`, `actorId`, `action` enum, `targetType`, `targetId`, `payload` (redacted), `ip`, `createdAt`). Write helper `AdminAuditService.log()` called from every admin mutation (approve/reject/ban/unban/delete/takedown/broadcast/commerce mutations). Expose `GET /admin/audit-logs` (paginated, AdminGuard) for traceability.
**Why:** Flat admin role needs accountability; audit is the cheapest RBAC substitute. Matches `admin-authorization` "guard re-reads DB" pattern (fresh actor).

### D4: Named throttler handling
**Decision:** Admin controller uses `@Throttler({ short: { ... }, long: { ... } })` explicitly or `@SkipThrottle({ short: false, long: false })` when skipping. Never use bare `@SkipThrottle()`. Admin mutations get tighter limits than public commerce reads.
**Why:** Memory `coturn-lan-health-fix` documents that bare `@SkipThrottle()` is ineffective when throttlers are named — a silent prod bug if repeated.
**Alternative:** Global rate limit ignore for admin — rejected, admin is high-privilege and should be throttled.

### D5: SAFE_PROJECTION as chokepoint
**Decision:** `const SAFE_PROJECTION = '-passwordHash -fcmTokens' as const;` remains the single projection reused by every user-returning admin query. New commerce/product schemas have their own safe projections (no secrets to leak).
**Why:** Zero leakage guarantee; verifier can grep for its usage.

### D6: Commerce module isolation
**Decision:** New `CommerceModule` (`Product`, `Store`, `Service` schemas) owned by admin CRUD. Public read `GET /commerce/products|services` is `@Public()` with optional pagination + `category` filter and `Cache-Control` header; admin CRUD is `JwtAuthGuard + AdminGuard`. Mobile reads the public endpoint; no shared build.
**Why:** Isolates preview commerce from chat domains; public read can be cached and does not require auth. Mirrors `MediaModule` presigned-URL pattern (public URL, private write).
**Alternative:** Reuse `MediaModule` for products — rejected, domain mismatch.

### D7: Message moderation via trusted soft-delete
**Decision:** `POST /admin/messages/:id/soft-delete` sets `deleted: true` (or `deletedFor: [allMemberIds]` where the schema uses per-user deletes) and emits `message_deleted` via `ChatGateway.io.to(conversation:<id>).emit(...)`. Guard checks `isPlatformAdmin` — no sender-ownership check (distinct from user `DELETE /conversations/:convId/messages/:msgId` which is sender-only + 24h).
**Why:** Operator must be able to remove abusive content regardless of sender; reuse existing append-first + soft-update model and existing socket event consumers (mobile already handles `message_deleted`).
**Alternative:** Hard delete — rejected, breaks sync/audit.

### D8: Reports as seed-then-wire
**Decision:** `Report` schema (`reporterId`, `targetType: 'message'|'story'|'user'|'conversation'`, `targetId`, `reason`, `status: 'pending'|'resolved'|'dismissed'`, `createdAt`). Seed 30 mock reports in `scripts/seed-admin-reports.ts`. Mobile report entry deferred; admin inbox is `GET /admin/reports` with resolve/dismiss mutations (write audit log).
**Why:** Gives the inbox UI something real to operate on without blocking on mobile work.

### D9: FE primitives over framework migration
**Decision:** Build small primitives: `TableShell`, `EmptyState`, `Pagination`, `PageHeader`, `ConfirmDialog`, `StatusBadge`, `MetricCard` (already exists), `SearchInput`, `BulkBar`. All consume `--koola-*` tokens in `admin-web/src/index.css`. No MUI/AntD.
**Why:** Roadmap `uiux-modernization-roadmap` Decision 6 explicitly rejects heavy framework migration; tokens already coherent.

### D10: Lightweight analytics rendering
**Decision:** Analytics page uses plain SVG sparklines/bars (no `recharts`/`chart.js`) with data from real `GET /admin/analytics` aggregations (`$group` by day/week). Charts degrade to table when JS disabled.
**Why:** Keeps bundle small; verifier can check aggregations without mocking chart libs.

## Risks / Trade-offs

- [Large admin surface increases attack surface] → All routes stay `JwtAuthGuard + AdminGuard`; `AdminGuard` re-reads DB (revoked admin loses access immediately); audit log makes abuse traceable. No `@Public()` on admin.
- [Admin message search over full-text index could be slow] → Limit to paginated admin use, not user-facing; add `conversationId` filter option to narrow scan; monitor via slow-query log.
- [Commerce public read could be scraped] → Pagination + rate limit; no auth required but `Cache-Control` + throttler `long`.
- [Socket broadcast for admin takedown could fan out to many clients] → Reuse existing `ChatGateway` room fanout (already Redis-adaptered); payload stays <10KB (IDs only).
- [Seed mock reports/products drift from real usage] → Seed script is idempotent and tagged `seed-` prefix; real data will naturally outnumber seed.

## Migration Plan

1. Ship Phase 0 first (foundation + FE primitives) — no schema migration beyond `AdminAuditLog` collection creation (auto-created on first write).
2. Phase 1 adds `Report` collection; run `seed-admin-reports.ts` once.
3. Phase 3 adds `CommerceProduct/Store/Service` collections; run `seed-commerce-from-mocks.ts` (reads `shoppingMockData.ts`/`servicesMockData.ts`) once.
4. Phase 3 mobile wiring is last — feature flag via `featureAvailability` (`preview` → `ready`) only after public commerce endpoints pass smoke test.
5. Rollback: admin routes are additive; removing the change is dropping the new collections and reverting `AppLayout` nav — no data migration rollback needed.

## Open Questions

- None blocking. Future: whether to add moderator role (distinct from `isPlatformAdmin`) once team grows — deferred; audit log satisfies immediate need.
