# Design

## Context

See `proposal.md` — Why / What Changes.

Current shape that constrains the approach:

- `admin-moderation.controller.ts` owns `GET /admin/conversations` and `GET /admin/conversations/:id`. The list handler builds one ad-hoc `filter` object in-line, then runs two independent query paths (a `reported` branch and a default aggregate branch), and repeats the pending-report aggregation a third time per row batch. There is no shared filter builder, so stats/export cannot reuse it today.
- List rows are returned with the full `members` array populated; `withDisplayNames()` needs it only to derive a display name, then the array is shipped to the client.
- `GET /admin/reports` already accepts `targetId` (`admin-moderation.controller.ts:611-621`), but `ConversationsPage.tsx:486-497` instead fetches `targetType=conversation&limit=50` and filters in the browser — correct only while a conversation has fewer than 50 total pending reports platform-wide.
- The list page is the only remaining admin page with hand-managed filter state (`useState` + `useEffect` fetch) and a `variant="drawer"` detail; `admin-web/DESIGN.md` §3A/§3B and §9 already define the target pattern and name this page as the known deviation.
- `report-labels.ts#reportTargetHref` emits `/conversations?focus=<id>`; `ConversationsPage.tsx:387-391` consumes it today by opening the drawer.

## Goals / Non-Goals

**Goals:**

- One conversation filter definition shared by list, stats, and export so the three can never disagree.
- Row payload proportional to what the row renders, not to conversation size.
- List behavior fully reconstructible from the URL; detail fully reconstructible from its path.
- Report moderation for one conversation fetched in one scoped request.

**Non-Goals:**

- Deleting, locking, or muting conversations — no endpoint or schema field exists, and DESIGN §0.7 forbids rendering a control for it.
- Replacing the message soft-delete, in-conversation find, media presign, or message-grouping logic already in the page; that code moves, it is not rewritten.
- Migrating other legacy list pages (`ReportsPage`, `CommerceOrdersPage`) off `PageHeader`.
- Introducing `socket.io-client` or i18n scaffolding — out of scope for this change.

## Decisions

### D1 — Extract a single `buildConversationFilter(dto)` in the moderation service/controller layer

All three consumers (list, stats, export) call one function that turns `ListConversationsDto` into a Mongo filter, so a filter added later is automatically available everywhere.

- **Chosen over**: duplicating the `if (dto.x) filter.y` blocks in each handler (the current style), because the specs require stats `all` to equal list `total` under identical filters, and copy-paste drift would break that silently.
- The existing `idSets` intersection (`hasPendingReport` / `minReports` / `hasMedia` → `_id: { $in: [...] }`) moves into this builder unchanged; it is already correct and already the expensive part.
- Date ranges use `common/utils/date-range.ts#applyCreatedAtRange` for `createdFrom`/`createdTo` and the same three invariants for the `lastMessageAt` range (only add a key when a value exists, inclusive upper bound, **merge** rather than overwrite).
- Because the builder performs async work (report aggregation, `distinct` on messages), it is `async` and awaited by every caller.

### D2 — Row projection: derive `memberCount` and drop `members` from list responses only

`withDisplayNames()` already batches a `userModel.find` across all member ids. It runs first; immediately after it, list rows are mapped to `{ ...row, memberCount, members: undefined }`. Detail is untouched and keeps the full array.

- **Chosen over**: an aggregation `$size` stage — the display-name lookup already materializes the array, so a second pipeline adds cost for no gain.
- **Chosen over**: keeping `members` "for compatibility" — no other consumer reads it (mobile uses the chat API, not the admin API), and the spec explicitly forbids it on list rows.
- Since `pendingReportCount` is already computed by the row-batch aggregation, that same aggregation gains `$min: '$createdAt'` to produce `oldestPendingReportAt` in one pass rather than a second query.

### D3 — Stats endpoint lives beside the list, not in `/admin/stats`

`GET /admin/conversations/stats` is registered in the same controller as the list. It returns `{ all, pendingReport, group, direct, hasMedia, active24h }`.

- **Chosen over**: extending the global `GET /admin/stats`, because that payload feeds the sidebar badge cache (`useAdminStats`, key `['admin-stats']`, `staleTime` 60s) — adding volatile conversation counts there would invalidate a shared cache for pages that do not need it, and would couple a page-local view to a global contract.
- Counts are `countDocuments` on the shared builder with the relevant predicate applied (e.g. `group` = builder + `type: 'group'`). Six counts, no client-side tallying.
- Frontend uses its own query key `['conversations-stats', ...filters]` with `staleTime: 60_000`.

### D4 — Export registered before `conversations/:id`

Express matches in registration order; `GET conversations/export` placed after `conversations/:id` would bind with `id = 'export'`. This is a recorded incident for reports (`admin.module.ts:100-101`).

- Returns `{ data, total, truncated }` with a hard 500 cap, mirroring `admin.service.ts` `users/export`.
- Frontend gates it behind `ExportButton` → confirm dialog stating scope, cap, and that conversation names are user content, plus `ExportDateRange`.

### D5 — Detail becomes a route with a thin page and a fetching component

```
/conversations/:id            ConversationsDetailPage.tsx   (thin: :id + location.state.from)
  └─ <ConversationDetail id>  components/ConversationDetail.tsx  (useQuery → detail-card)
/conversations                ConversationsPage.tsx         (list, navigate on row activate)
```

- Matches the `AuditLogPage` / `AuditLogDetailPage` / `AuditLogDetail` template that DESIGN §9 prescribes.
- `ConversationDetail` is extracted from the existing drawer JSX with minimal edits: `drawer-body` → `detail-card-body`, `drawer-header` → `detail-header`, plus the new description-list header and badges. The message stream, grouping, find bar, and presign-retry blocks are carried over verbatim.
- Ordering inside the card follows DESIGN §3B: header (avatar/name/badges/actions) → `description-list` → members → message stream → pending reports → bottom bar.
- `reportedMessageCounts` (already returned by `GET /admin/conversations/:id`) maps to a badge on each message row; this field is currently fetched and discarded.
- The disabled delete-conversation button is deleted, not ported.

### D6 — `focus` compatibility resolved by redirect, not by dual code paths

`reportTargetHref` keeps emitting `/conversations?focus=<id>`. The list page maps a non-empty `focus` value to `navigate('/conversations/' + focus, { replace: true })` on mount, so:

- report → conversation links keep working through the transition,
- there is exactly one detail implementation,
- closing the detail never needs to strip a query param again (the old `closeDetailAndClearFocus` dance disappears).

`focus` is read through `useUrlFilters` like every other param, so it is removed by `set({ focus: '' })` when the redirect consumes it.

### D7 — List state is URL-only; fetch is `useAdminList`

```ts
useUrlFilters({ tab, q, sort, type, size, minReports, media, since, from, to, page, pageSize, focus })
useAdminList(['conversations', ...everyValue], '/admin/conversations', params)
```

- Query key contains **every** filter (DESIGN §8) — a filter that is not in the key is a filter that does not refetch.
- Search debounces 400 ms and commits immediately on Enter.
- `FilterPopover` holds everything beyond the one search box (type, size, hasMedia, minReports, since, from/to, sort); the active-condition badge drives the chip row. DESIGN §3A caps the toolbar at one search box plus one popover.
- Tabs map 1:1 to params and their counts come from D3. Default tab is `all`; default sort is `recent`.
- No `BulkBar`: there is no conversation-level bulk action, and rendering a selection column with nothing to select would violate §0.7.

### D8 — Keyboard model copied from `BusinessesPage`

`j`/`k` move a highlight index, `Enter` opens the highlighted row, `/` focuses search (already present), `?` opens a help dialog listing shortcuts. Highlight is index-only state (`-1` = none), never derived from filters.

**Rejected alternative**: making the table `role="grid"` with roving tabindex. It would be more correct for screen readers, but it is a pattern no other admin page uses; introducing a second table interaction model costs more in inconsistency than it returns in a11y for a page whose users are keyboard-driven moderators. Row activation stays reachable by Tab + Enter.

### D9 — Responsive columns follow the existing class ladder

`.col-hide-mobile` (860px) for "Tạo lúc" and media, `.col-hide-xs` (1099px) for report age, each with a `.show-under-*` duplicate in the first cell so no datum disappears (DESIGN §6). Table `min-width` steps down 760 → 520 → 0.

### D10 — Mở rộng sau audit (2026-11-02): dữ liệu đã fetch phải được dùng

Audit sau khi verify widths chỉ ra data backend đã trả mà UI bỏ qua, và 2 capability
DTO có sẵn chưa có lối vào UI. Quyết định:

- **`sort=reportAge`** vào allow-list (cùng họ `reported`): chỉ liệt kê hàng có báo cáo
  chờ, sắp `oldest` asc, tiebreak `_id` để phân trang ổn định — cùng nhánh code với
  `sort=reported`, không thêm pipeline mới.
- **`pinnedMessages` resolve lúc đọc** ở detail (như `targetName` của báo cáo): messageId
  trần là dữ liệu thô cấm hiển thị (§B2); một query messages + members-map là đủ.
- **Lịch sử báo cáo = query thứ hai** (`targetId`, KHÔNG truyền `status`) thay vì nới
  lỏng query pending: tách hai hàng đợi, không bao giờ đẩy báo cáo cũ vào queue chờ
  xử lý.
- **Khoảng ngày hoạt động `afrom/ato`** (chuỗi ngày, cùng quy ước `from/to` tạo lúc):
  DTO `activeFrom/activeTo` có từ task 1.2 nhưng UI chỉ có preset `since` — thêm cặp
  ô日期 thứ hai trong FilterPopover thay vì biến `since` thành range.
- **Context render trong bong bóng tin nhắn** (reply quote + reaction tally) đặt ở
  wrapper `.conv-bubble` của component cha — không đụng signature `MessageBody`,
  không sửa logic find/grouping đã port.

### D11 — Export bản ghi hội thoại từ trang chi tiết (task 8)

- **CSV, không xlsx**: giữ quy ước repo (CSV + BOM mở Excel thẳng, không thêm
  thư viện); dialog confirm nêu cap 500 + "nội dung người dùng tạo".
- **`GET conversations/:id/export`** cap 500 tin MỚI NHẤT, sort desc đúng hướng
  với luồng xem detail; `{ data, total, truncated }` như mọi export khác.
- **Không presign trong CSV** — URL hết hạn 60 phút vô nghĩa trong file; thay bằng
  cờ `hasMedia`. `senderName` resolve qua members-map + một lần lookup cho người
  đã rời hội thoại; báo cáo chờ/tin aggregate theo đúng tập id đã tải.

## Risks / Trade-offs

- **Filter builder is `async` and does report aggregation per call** → stats calls it 6×. Mitigation: build the shared `_id` intersection **once** in the stats handler and pass the prepared filter into each count, so the expensive `distinct`/aggregate runs a single time per stats request.
- **`hasMedia` runs `distinct('conversationId')` over the message collection** → slow on a large corpus. Mitigation: pre-existing behavior, unchanged; if it becomes a problem the follow-up is an index on `type` or a denormalized flag, tracked outside this change.
- **Removing `members` from list rows is a client-visible contract change** → any consumer reading `rows[].members` breaks. Mitigation: grep confirms the only reader is `ConversationsPage.tsx` (`c.members?.length`), updated in the same commit; detail keeps the field, so the drawer-era shape stays reachable while the list migrates.
- **Route migration orphans the `?focus=` deep link** → report links would 404-ish (land on list with no detail). Mitigation: D6 redirect is implemented in the same commit as the route, and it is a named acceptance scenario.
- **`export` route shadowing `:id`** → a conversation whose id is literally `export` becomes unreachable and export silently 404s. Mitigation: registration order (D4) plus a spec scenario.
- **Six `countDocuments` per stats call** → extra load on list mount. Mitigation: `staleTime: 60_000`, no refetch on window focus; all counts share one filter build.
- **`oldestPendingReportAt` only covers pending reports** → a conversation whose reports are all resolved shows no age, correctly. Resolved history stays in the report inbox, not on the row.

## Migration Plan

1. Backend first: filter builder → list projection → stats → export, each with a colocated spec; `npx jest src/admin` green at every step. List keeps accepting old params, so the change is non-breaking for the current UI until step 3 lands.
2. Frontend list refactor (D7/D8/D9) against the new/unchanged endpoints; list still opens a drawer at this point is not allowed — the list row and detail route ship together (step 3) so no intermediate commit renders a dead row click.
3. Detail route + `focus` redirect (D5/D6), then delete the drawer code path.
4. Export dialog (D4) and design-doc debt notes (`DESIGN.md` §9, `AGENTS.md` table).

**Rollback**: steps are independently revertible by commit. Step 1 alone is backward-compatible (old client keeps working). Reverting step 3 restores the drawer; reverting only step 1 after step 3 would break `memberCount` and stats, so steps 1 and 3 revert together.

## Open Questions

- Should `minReports` surface as its own checkbox or only as the tab "Chờ báo cáo"? Resolved during implementation either way: the tab covers the common case, `minReports` stays available in the popover for ">3 reports" triage — no spec change required.
- Whether the list should also offer a `sort=reported` UI control. Deferred: the API allow-list already includes it (D1/spec), and adding the control later is a one-line popover addition that changes no requirement.