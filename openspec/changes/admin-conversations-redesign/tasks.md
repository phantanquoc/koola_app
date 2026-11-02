# Tasks

> **Thứ tự thực hành (hard dependencies — đọc trước khi làm §3/§4):**
> `4.1→4.5 (code đã có trong working tree, untracked — chỉ verify + thêm vitest)` → `4.6` → `3.1` → `3.4` → `3.2/3.3/3.5/3.6` → `3.7` → `3.8` → `3.9` → `3.10` & `4.7` → `5.1` → `6.x`
>
> - `3.8 ⩾ 4.6`: redirect/navigate tới `/conversations/:id` trước khi register route → catch-all `App.tsx:81` đá về Dashboard và `replace:true` nuốt history.
> - `3.9 ⩾ 4.2/4.3`: 3.9 xoá drawer JSX mà 4.2/4.3 port ra — checkout mới sẽ mất nguồn port.
> - `3.8 ⩾ 3.9` (cùng commit lý tưởng): xoá drawer khi row còn gọi `openDetail` → click chết.
> - `4.7 ⩾ 3.9`: DESIGN §9 chỉ được ngừng gọi trang này là drawer holdout sau khi code hết drawer.
> - `4.5 (verify) ⩾ 3.1`: invalidation `['conversations']` chỉ quan sát được khi list dùng `useAdminList`.
>
> **Gate của change này:** `npx tsc -b` (không phải `--noEmit` — tsconfig solution-style nên `--noEmit` là no-op) và `npm run lint`, chỉ tính **0 lỗi mới trong các file đã sửa**; 12 lỗi tsc -b + 7 lỗi lint pre-existing ngoài phạm vi conversations được ghi nhận, không chặn.

## 1. Backend — shared filter builder and lighter rows

- [x] 1.1 Extract an async `buildConversationFilter(dto)` that owns every existing `if (dto.x) filter.y` block plus the `hasPendingReport`/`minReports`/`hasMedia` id-set intersection, and make `listConversations` call it; verify with `npx jest src/admin` that `admin-moderation.controller.spec.ts` still passes
- [x] 1.2 Add `createdFrom`/`createdTo` (via `common/utils/date-range.ts#applyCreatedAtRange`) and `activeFrom`/`activeTo` (merged onto `lastMessageAt`) to `ListConversationsDto`; verify with a spec asserting an inclusive range narrows list results
- [x] 1.3 Constrain `sort` with an allow-list `@IsIn(['recent','created','reported','members'])`; verify with a spec asserting `sort=password` returns 400 and `sort=members` keeps pages stable
- [x] 1.4 Return `memberCount` and omit `members` on list rows while `GET /admin/conversations/:id` keeps the full member array; verify with a spec asserting row shape and detail shape side by side ← (verify: list response has no `members` key, detail response does — a contract change every consumer must see)
- [x] 1.5 Extend the row-batch report aggregation with `$min: '$createdAt'` so rows carry `oldestPendingReportAt`; verify with a spec asserting a reported row has both count and age and an unreported row omits the age field

## 2. Backend — stats, export, index

- [x] 2.1 Add `GET /admin/conversations/stats` returning `{ all, pendingReport, group, direct, hasMedia, active24h }`, building the shared filter once and reusing it for every count; verify with a spec asserting `all` equals `total` from the list under identical filters and that a non-admin receives 403
- [x] 2.2 Add `GET /admin/conversations/export` applying the same filter, capped at 500 rows and returning `{ data, total, truncated }`, registered **before** `conversations/:id`; verify with a spec asserting 1200 matches yields 500 rows + `truncated: true`, that `type=group` is honored, and that a non-admin receives 403 ← (verify: route registration order — a request for `/admin/conversations/export` must return the export payload, not be captured by the `:id` handler; see the recorded reports incident in `admin.module.ts:100`)
- [x] 2.3 Check whether `reports` has a compound index covering `{ targetType, status, targetId }` and add it via `Schema.index()` if missing; verify no "Duplicate schema index" warning appears in the jest output
- [x] 2.4 Run the backend gates for this group: `npx jest src/admin` and `./node_modules/.bin/tsc --noEmit` both pass

## 3. Frontend — list rebuilt to the standard list archetype

- [ ] 3.0 **Hotfix regression đang sống**: backend 1.4 đã ship `toListRows` bỏ `members` + thêm `memberCount` (`admin-moderation.controller.ts:396-404`) nhưng UI vẫn đọc `c.members?.length` (`ConversationsPage.tsx:753`) → cột Thành viên hiện 0 mọi row. Đọc `c.memberCount ?? 0`; verify bằng vitest assert row render `memberCount` ← (verify: bug thật người dùng thấy — làm trước mọi task khác)
- [ ] 3.1 Replace every filter `useState` and the fetch `useEffect` with `useUrlFilters({ tab, q, sort, type, size, minReports, media, since, from, to, page, pageSize, focus })` plus `useAdminList` whose query key contains every filter value; verify with a vitest asserting URL params map **deterministically** onto outgoing request params — dịch `tab→…`, `q→search`, `size→minMembers/maxMembers`, `media→hasMedia`, `since→activeAfter`, `from/to→createdFrom/To`, `pageSize→limit`, `size→minMembers/maxMembers`, và **`focus` không bao giờ gửi lên API** (DTO `ListConversationsDto` không có field đó + `forbidNonWhitelisted` → 400 nếu gửi)
- [ ] 3.2 Build the header from `ListHeader` (title + count inline + actions) with a search input debouncing 400 ms and committing on Enter, and `StatusTabs` whose counts come from `/admin/conversations/stats`; verify with a vitest asserting tabs render server counts and suppress a zero count
- [ ] 3.3 Move all remaining conditions into `FilterPopover` (type, size, media, minReports, since, from/to, sort) behind an active-condition badge, with a removable-chip `context-row` beneath it; verify with a vitest asserting the badge counts active conditions and removing a chip clears that param
- [ ] 3.4 Rebuild the table on `data-table--compact` with sortable `ColumnHeader` columns (Hội thoại, Thành viên, Hoạt động cuối, Tạo lúc, Báo cáo, Media, Hành động), `.col-num` on numeric cells and `.col-hide-*` paired with `.show-under-*` duplicates; verify with a vitest asserting `aria-sort` toggles and the chosen sort lands in the URL
- [ ] 3.5 Wire the three states: `StateBlock variant="error"` + retry calling `refetch()`, skeleton while loading, and per-tab `EmptyState` copy distinguishing "truly empty" from "no match for filters" with a clear-filters action; verify with a vitest covering the error→retry refetch path and both empty variants
- [ ] 3.6 Replace the two-button pager with `Pagination` (page-size 10/20/50 + goto) rendered whenever `total > 0`; verify with a vitest asserting a page-size change resets to page 1 and persists in the URL
- [ ] 3.7 Add keyboard navigation (`j`/`k` move a highlight index, `Enter` opens, `?` opens a shortcut help dialog) while keeping `/` focus-search; verify with a vitest simulating the key events
- [ ] 3.8 **⛔ Đặt sau 4.6.** Make row activation call `navigate('/conversations/' + id, { state: { from: pathname + search } })`, and translate a non-empty `focus` param into a `replace` redirect to that route — **redirect một lần duy nhất**: KHÔNG gọi thêm `set({ focus: '' })` (`useUrlFilters.set` tự navigate `replace` → double navigation); `state.from` tính bằng URLSearchParams **bỏ `focus`**, giữ param khác (`?focus=x&tab=pending` → back về list có filter). Ghi đè design.md D6 (dòng 87). Source duy nhất: `report-labels.ts:56` → `ReportDetail.tsx:145`; verify with a vitest asserting the navigation state carries the full list URL minus `focus` and that `?focus=<id>` resolves to `/conversations/<id>` ← (verify: report→conversation mở đúng hội thoại cũ, Back trả về list có filter; không loop)
- [ ] 3.9 **⛔ Đặt sau 4.2/4.3, cùng commit với 3.8.** Delete the drawer invocation (`ConversationsPage.tsx:794-998`), the inline-styled filter popover (`:622-635`), the disabled "Xóa hội thoại" control (`:982-992`), and the raw `<p class="alert">` error (`:679`); **sweep dead code kéo theo** để `no-unused-vars`/`noUnusedLocals` xanh: import `Dialog`/`ConfirmDialog`/`useToast`/icon lucide/`moderation-media.css`, toàn bộ detail state + find machinery (`:265-470`), `openDetail/loadOlder/executeSoftDelete/actOnReport`, helper `escapeFind/hi/MessageBody/...` (`:122-247`); `Conversation.members` → `memberCount`. Verify by grep that `variant="drawer"`, `style={{`, and "Xóa hội thoại" are gone from the page
- [ ] 3.10 **⛔ Đặt sau 3.9.** Prune `ConversationsPage.css` drawer-only rules (`:192-209` `.conv-drawer*`, `:248-255` `.conv-drawer-body`; GIỮ `.conv-findbar*`, `.conv-members*`, `.conv-chat`/`.conv-msg-*`, `.conv-reports*` — `ConversationDetail.tsx:1` vẫn import file này) và xoá block `.drawer-header/.drawer-body` chết ở `index.css:2127-2140` (không trang nào khác dùng); cập nhật `admin-web/AGENTS.md`: dòng `/conversations` + mục §6 "`variant="drawer"` chỉ còn ở 3 trang legacy" (thực tế 1 → 0); verify với gate changed-files (`npx tsc -b` + `npm run lint` không phát sinh lỗi mới) và loading 1440 / 860 / 390 widths không scroll ngang

## 4. Frontend — detail as a shareable route

> **4.1–4.5 đã code sẵn trong working tree** (`ConversationsDetailPage.tsx` 32 dòng, `ConversationDetail.tsx` 736 dòng — cả 2 file untracked). `ConversationDetail` là strict superset của drawer (scoped reports, badge 4.4, disclosure 4.2, bỏ "Xóa hội thoại" đúng spec). Việc còn lại: đọc lại đúng task, **verify + bổ sung vitest** — không port lại từ đầu. Fix 1 điểm lệch nhỏ so với drawer: find-hint thiếu nhánh `detailHasMore` (`ConversationDetail.tsx:539` vs drawer `:850`).

- [ ] 4.1 `pages/ConversationsDetailPage.tsx` **đã có** — verify: vitest assert Back control trả về `location.state.from`, fallback `/conversations` khi load trực tiếp (state sống cả qua F5 nhờ `history.state`)
- [ ] 4.2 `components/ConversationDetail.tsx` **đã có** — verify: vitest assert không có ObjectId render ngoài disclosure "Chi tiết kỹ thuật"
- [ ] 4.3 Message stream **đã có** (5-min grouping, find bar, load-older, presign retry; media chỉ nhận `*Signed` — bản này đã fix bug `mediaUrlSigned` fallback key thô mà drawer còn mắc `:175`) — verify: vitest assert `mediaUrlSigned === null` hiện unavailable block, không dùng raw key làm `src` ← (regression guard cho bug lịch sử object key render thành ảnh)
- [ ] 4.4 `reportedMessageCounts` badge **đã có** (`:617,633-635`) — verify: vitest assert badge hiện count
- [ ] 4.5 Reports scoped `targetType=conversation&targetId=<id>&status=pending` **đã có** (`:253-256`), invalidate `['conversations'],['conversations-stats'],['conversation-reports']` (`:419-424`) — verify: vitest assert params scoped + invalidation quan sát được (chỉ sau 3.1) ← (verify: request scoped by `targetId`, không fetch cả trang rồi filter client — behavior mà change này tồn tại để sửa)
- [ ] 4.6 **⛔ Đặt trước 3.8.** Register the `conversations/:id` route in `App.tsx` (sibling của `users/:id` `:60`); verify by loading the URL directly in the browser with the page rendering the conversation
- [ ] 4.7 **⛔ Đặt sau 3.9** (khi code đã hết drawer mới được hết doc). Update `DESIGN.md` §9: xoá mục drawer (`:673-675` — đúng tới khi 3.9 chạy) **và sửa mục focus (`:676-679`) — mục này SAI cả hai chiều từ trước**: code ĐÃ đọc `focus` (`ConversationsPage.tsx:369-391`) và `report-labels.ts:56` vẫn trả link sống (commit `0fd222a` bật lại 2026-10-28), "Đã bỏ link chết" là false. Ghi đúng: focus hoạt động, redirect `replace` sang `/conversations/:id`, **bắt buộc giữ** `reportTargetHref` (§0.7 cấm link chết). Verify: doc không còn gọi trang này là drawer holdout, không còn câu "bỏ link chết"; rồi run `npx vitest run` + gate changed-files (`npx tsc -b`)

## 5. Frontend — CSV export

- [ ] 5.1 Wire `ExportButton` to a confirm dialog stating scope, the 500-row cap, and that conversation names are user content, plus `ExportDateRange` for the export-only date range; verify with a vitest asserting the dialog copy and that export params carry the current filters and range

## 6. Integration verification

- [ ] 6.1 Run the full gates: `cd admin-web && npx vitest run && npx tsc -b && npm run lint` (tsc -b, **không** `--noEmit` — tsconfig solution-style nên `--noEmit` check 0 file; pass = không có lỗi mới trong file đã sửa của change, 12 tsc + 7 lint pre-existing ngoài conversations được ghi nhận), then `cd chat-backend && npx jest src/admin && ./node_modules/.bin/tsc --noEmit`
- [ ] 6.2 Manual pass at 1440 / 1024 / 860 / 390 widths and at ≤820 px height, confirming the single-scroller rule, sticky header, and column-ladder fallbacks
- [ ] 6.3 Walk the `admin-web/DESIGN.md` §8 list checklist line by line and the §10 copy table, confirming each item is observable on this page ← (verify: every checklist row is grep-able or demonstrable, not asserted by feel)
- [ ] 6.4 Run `openspec validate admin-conversations-redesign` and confirm each spec scenario in `specs/` maps to a passing test or a demonstrable behavior