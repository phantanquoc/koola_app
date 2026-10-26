# DESIGN.md — Admin Console Visual Language

Ngôn ngữ giao diện cho `admin-web`: **công cụ vận hành, không phải trang marketing**.
Người dùng là moderator/operator xử lý hàng trăm ticket mỗi ngày — mọi pixel phục vụ
quyết định nhanh: mật độ cao, quét được bằng mắt, làm được bằng bàn phím.

> DNA marketing (ElevenLabs/Waldenburg/hero) nằm ở `koola_app/DESIGN.md` — KHÔNG áp dụng ở đây.
> Mobile có DNA riêng: `openspec/ui-dna.md` — KHÔNG áp dụng ở đây.
> Token sống trong `src/index.css` (`:root`); component kit sống trong `src/components/`.
>
> **Bản tham chiếu sống:** `src/pages/BusinessesPage.tsx` + `src/components/BusinessDetailDrawer.tsx`
> là hiện thân đầy đủ nhất của tài liệu này. Mâu thuẫn giữa tài liệu và code → sửa code
> hoặc sửa tài liệu trong cùng PR, đừng để lệch.

## 0. Nguyên tắc (áp dụng trước mọi chi tiết)

1. **Mật độ hơn trang trí.** Trang quản lý hiện nhiều dòng, ít cuộn. Padding bảng
   10–12px, font data 13–14px — không dùng padding 15–24px kiểu landing page.
2. **Không double-header.** Topbar đã hiện title route → page header trên trang data
   CHỈ gồm title gọn (20–24px, 700) + actions bên phải. Cấm eyebrow + title 28–40px
   trên trang data (giữ cho dashboard và login).
3. **Trang trí có chỗ đứng duy nhất:** login + empty-state. Cấm orb/decoration trên
   bảng, metric, drawer, dialog.
4. **Mọi thứ share được phải share được:** filter/search/pagination/sort nằm trong URL
   (deep-link cho moderator khác). Detail route mở trực tiếp được.
5. **Phá hủy luôn có confirm; diện rộng luôn type-to-confirm.** Không ngoại lệ.
6. **Mỗi trang chọn đúng một archetype ở §3 — cấm chế layout thứ năm.** Trang list mới
   lấy khung từ `BusinessesPage`, không dựng toolbar/bảng/pagination mới.
7. **Không có nút giả.** Mọi control hiển thị ra phải có tác dụng thật; tính năng chưa
   làm thì ẩn, không để nút bấm không làm gì.
8. **Mỗi field trong DB mà admin cần quyết định phải đi đủ bộ ba:** hiện ở đâu → lọc
   được ở server → có hành động đảo ngược. Field không đọc được ở bất kỳ đâu là dead
   field (đã từng xảy ra với `suspended`).

## 1. Token (giữ nguyên, làm rõ cách dùng)

Nền canvas `#f5f5f4`, surface trắng, chữ ink `#1c1917`, muted `#78716c`.
Primary chàm `#4f46e5` — chỉ dùng cho link, focus ring, icon nhấn, nav active.
**Nút primary = nền ink, radius 8px (`radius-sm`) — KHÔNG pill** (pill chỉ cho
badge/chip/avatar). Hover primary = ink đậm hơn, không nhảy sang chàm.
Semantic giữ 3 tone (base/soft/dark); chữ trên nền soft LUÔN dùng tone-dark.
`--koola-faint` chỉ decoration, cấm làm chữ đọc được.
Spacing theo thang `--space-1..7`; font data/mono dùng JetBrains Mono (`.k-mono`)
cho id, số, ngày giờ, tuổi ticket.

Quy tắc: cấm hex/px cứng ngoài `index.css`; auditor grep `#[0-9a-fA-F]` ngoài file đó.

## 2. App-shell (đã dựng đúng code — giữ)

- Environment banner 32px trên cùng: DEV = primary-soft/primary-dark;
  PROD = danger-soft/danger-dark + prefix "PROD".
- Sidebar 264px / rail 76px icon-only, nav item 44px, active = primary-soft +
  primary-dark; icon item thường nền trong suốt (primary chỉ cho active);
  section label 11px uppercase; brand gọn (mark 32px + tên, collapsed chỉ mark);
  nút thu gọn = tab floating (22×56px, radius-sm) ôm mép phải sidebar giữa chiều
  cao; collapse lưu localStorage; logout ghost + confirm preview identity;
  mobile ≤860px thành drawer + backdrop (giấu edge-toggle).
- Topbar 72px: breadcrumb `Koola / {route}` trái (KHÔNG title — title thuộc page);
  **command palette** (`/` hoặc Cmd/Ctrl+K mở, fuzzy không dấu, ↑↓+Enter+Esc)
  tìm chức năng trước + fallback tìm users/messages + identity chip phải
  (không badge thừa, ẩn text khi loading).
- Content tối đa 1440px, padding 32px (16px ở mobile).

## 3. Archetype trang (mọi trang mới chọn 1 trong 4, không chế layout lạ)

### A. Trang queue/list — mặc định cho users/businesses/reports/messages/orders/…

`BusinessesPage.tsx` là **bản tham chiếu duy nhất**. Trang list mới copy khung từ đó,
không tự dựng lại. Thứ tự dọc, đủ 8 tầng:

```
1. ListHeader        title + count inline + actions (Xuất CSV, Thêm) — một hàng
                     hàng 2 = filter row: search debounce 400ms + checkbox lọc nhanh
2. StatusTabs        tab "Tất cả" đầu tiên, count lấy từ /admin/stats
3. context-row       MỘT hàng: bucket ưu tiên (SLA) + chip lọc đang bật
4. BulkBar           chỉ render khi count > 0, chỉ ở tab thao tác được hàng loạt
5. Table             compact, sticky header, cột actions sticky phải, click hàng mở drawer
6. Pagination        luôn render khi total > 0, page-size 10/20/50 + goto
7. Detail             route riêng `/x/:id` (component inline) hoặc modal 720px — xem §3B
8. Confirm + Toast   cho mọi mutation
```

Quy ước bắt buộc cho mọi trang list:

| Hạng mục | Quy ước |
|---|---|
| State | tab/search/filter/sort/page/pageSize nằm trong URL qua `useUrlFilters`. **Cấm** `useState` cho filter |
| Fetch | `useAdminList` (TanStack Query). **Cấm** `useEffect` + fetch tay |
| Sort | `field:asc`/`field:desc`, whitelist field ở server. Queue duyệt mặc định `createdAt:asc` |
| Search | debounce 400ms + Enter chốt ngay; server tìm trên tên/email/SĐT/MST/ID |
| Lọc theo cột | `ColumnHeader.filter` (popover portal). Không thêm `<select>` rời ở toolbar |
| Chọn dòng | reset selection khi tab/filter/page đổi; chỉ chọn được trang hiện tại |
| Empty | phân biệt "trống thật" vs "không khớp lọc" — copy khác nhau + nút "Xoá bộ lọc" khi có lọc |
| Error | `StateBlock variant="error"` + nút Thử lại gọi `refetch()`. **Cấm** nuốt lỗi (`.catch(() => {})`) |
| Mutation | busy chặn double-submit; toast nêu tên đối tượng; hoàn tác được thì có nút Hoàn tác |
| PII | `MaskedPII` cho mọi SĐT/email trên bảng. CSV xuất không che nhưng phải confirm |
| Export | `ExportButton` + dialog nêu phạm vi, cap 500 dòng, cảnh báo dữ liệu nhạy cảm |
| Bàn phím | J/K di chuyển, Enter mở, A/R quyết định, `?` mở bảng trợ giúp |
| Mobile ≤860px | ẩn cột phụ bằng `.col-hide-mobile`; giữ Tên + Trạng thái + actions |

Empty-state copy theo tab, không dùng một câu chung: tab Chờ duyệt viết
"Hàng đợi trống — chuyển sang tab khác để kiểm tra", tab Lưu trữ viết
"Hồ sơ bị xoá mềm sẽ nằm ở đây và khôi phục được".

### A2. Từ vựng trạng thái & thang mức độ phá huỷ (dùng chung mọi trang data)

Một bản ghi quản trị nằm trên **bốn trục trạng thái độc lập** — không gộp thành một
cột "Trạng thái":

| Trục | Field | Nghĩa | Hiển thị |
|---|---|---|---|
| Vòng đời duyệt | `verificationStatus` | pending/verified/rejected | `VerificationBadge` |
| Ẩn khỏi catalog | `suspended` | tạm ngưng bán — **không** phải vi phạm | badge muted "Tạm ngưng" |
| Khoá đăng nhập | `isBanned` + `banReason`/`bannedUntil` | vi phạm | badge danger "Bị cấm" |
| Đã xoá | `deletedAt` | xoá mềm, khôi phục được | tab Lưu trữ |

Mỗi trục phải đủ bộ ba: hiện badge trên hàng → lọc được ở server → có hành động đảo ngược.

Thang mức độ hành động — chọn đúng bậc, không nhảy cóc:

| Bậc | Ví dụ | Confirm | requireText |
|---|---|---|---|
| Đảo ngược, hẹp | duyệt, khôi phục, gỡ cấm | ConfirmDialog thường | — |
| Ẩn tạm | tạm ngưng bán | ConfirmDialog + nêu rõ khác ban | `XACNHAN` |
| Phá huỷ hẹp | xoá mềm 1 hồ sơ | ConfirmDialog danger + nêu khôi phục được | `XACNHAN` |
| Diện rộng | bulk duyệt/từ chối | preview ≤10 dòng + "và N nữa" | `XACNHAN` |
| Không hoàn tác | broadcast | preview + đếm người nhận | gõ đúng chữ khoá |

Ba bậc dễ lẫn nghĩa — copy phải nói rõ: **Vô hiệu hoá = tạm ngưng bán, hồ sơ vẫn
xác minh** ≠ **Cấm = khoá đăng nhập + thu hồi phiên** ≠ **Xoá = khỏi danh sách, còn trong DB**.

### B. Trang detail — luôn là component/route, KHÔNG dùng drawer

**Quyết định (2026-10-26): bỏ drawer khỏi mọi trang quản trị.** Chi tiết hiển thị
bằng component inline; overlay chỉ dùng cho hộp thoại ngắn (confirm, form < 6 field).

Hai hình thức, chọn theo nhu cầu chia sẻ:

| Hình thức | Khi nào | Cách làm |
|---|---|---|
| **Route riêng** `/audit-logs/:id`, `/businesses/:id` (chuẩn) | Chi tiết có nhiều mục, cần deep-link/share, người khác mở đúng bản ghi | Page mỏng + component `<XDetail id>` render `<section className="detail-card">`. Nút "Quay lại" dùng `location.state.from` để về đúng filter/trang cũ |
| **Modal giữa màn hình** (`dialog--wide` 720px) | Xem nhanh từ list, nội dung vừa một màn, không cần share | `<BusinessDetailDrawer>` hiện là modal này — tên file giữ nguyên, hình thức là modal |

Nội dung chi tiết, thứ tự cố định: header (avatar/tên + badge trạng thái + actions)
→ `description-list` → block ngữ cảnh (payload/tin nhắn/report cũ) → timeline/audit
→ bottom bar (hành động phụ trái, quyết định phải).

Cấm:
- Không `variant="drawer"` cho trang mới (nó trượt từ phải, che list, không share được).
- Không mở tab mới ở bất kỳ bước nào.
- Không nhồi chi tiết dài vào overlay: nội dung > 1 màn thì phải là route.

### C. Dashboard —marketing duy nhất được phép to

- KPI row: MetricCard gọn (label 13px + value 28–32px/800 + delta/helper),
  **không orb trang trí**. Click KPI deep-link tới trang list đã lọc sẵn.
- Chart (recharts): series dùng tone-dark theo ngữ nghĩa; grid hairline;
  time-range = segmented control; range rỗng = EmptyState, không vẽ trục trống.

### D. Form/mutation — dialog, không drawer

- Dialog 520px cho confirm/form ngắn (ban/reject/soft-delete); `dialog--wide` 720px
  cho form nhiều nhóm field (tạo/sửa hồ sơ).
- reason = textarea bắt buộc, durationDays = select (1/3/7/30 + vĩnh viễn);
  nút confirm disabled tới khi hợp lệ. Giữ input khi submit lỗi.
- Broadcast: form + panel preview + type-to-confirm "BROADCAST" (không undo).

## 4. Table — spec mật độ

Mặc định mọi bảng quản lý dùng variant **compact**:

- Font 13.5–14px, padding ô 10–12px ngang 12–16px; header 12px uppercase muted, sticky.
- Cột id/user/target: dòng 1 = title/link (700), dòng 2 = meta muted 12px (id mono).
- Cột số/ngày/tuổi: mono, canh phải cho số.
- Hàng có checkbox khi bulk được; hàng selected = nền primary-soft nhạt;
  hàng cảnh báo (quá SLA, banned) = viền trái 3px tone tương ứng, không tô cả hàng.
- Cột actions sticky phải, nút `btn-sm`; hành động phá hủy = danger-ghost.
- Header sortable có icon mũi tên + `aria-sort`; click giữ nguyên filter trong URL.
- Tuổi ticket: <24h muted; 24–72h badge warning; >72h badge danger.

## 5. Kit (dùng, không chế mới — thiếu thì thêm theo spec này)

| Component | Spec |
|---|---|
| `ListHeader` | **header chuẩn cho trang list**: title 20–24px/700 + count inline + actions phải; slot `children` = filter row. Dùng cho mọi trang list mới |
| `PageHeader` | chỉ cho trang **không phải list** (detail, cài đặt, dashboard). Trang list mà dùng `PageHeader` là lệch mẫu |
| `TableShell` | vỏ bảng + toolbar tuỳ chọn + footer; trang list mới không truyền `title` (title đã ở `ListHeader`) |
| `StatusTabs` + `.tabs` | pill group, tab active nền ink chữ trắng; `count` chỉ hiện khi > 0 |
| `ColumnHeader` | `<th>` sort được (`aria-sort`) + phễu lọc popover portal; `className="col-hide-mobile"` cho cột phụ |
| `BulkBar` | chỉ render khi `count > 0`; badge count + preview 3 tên + nút bulk + Bỏ chọn; class CSS `.bulk-bar`, cấm inline style |
| `Pagination` | luôn render khi `total > 0` (kể cả 1 trang) để tổng số không biến mất; page-size + goto cho queue |
| `ExportButton` | nút + dialog confirm nêu phạm vi (cap 500, PII không che) |
| `MaskedPII` | SĐT/email che mặc định, click reveal, tự che 30s |
| `StatusBadge` / `VerificationBadge` | mapping cố định: verified/success → success; pending → warning; banned/rejected → danger; unknown/absent → muted |
| `ConfirmDialog` | focus-trap; destructive + reason bắt buộc; thứ tự nút **confirm trước, Hủy sau**; slot `preview` tóm tắt; `requireText` theo §3A2 |
| `StateBlock` | loading/error có nút Thử lại; `EmptyState` cho rỗng, có `action` khi đang lọc |
| `AuditLogDetail` | chi tiết audit inline: header + `description-list` + payload JSON + bottom bar. Route `/audit-logs/:id`, không overlay |
| `detail-card` + `detail-header`/`detail-card-body`/`detail-bottombar` | khung chi tiết inline dùng chung cho route `/:id` — header (avatar/tên/badge) → body → bottombar |
| `LicensePreview` | preview + lightbox 720px trước khi duyệt/gỡ — gỡ mù là cấm. Prop `label` cho ảnh không phải giấy phép |
| `Toast` | feedback sau mutation; 429 = warning "thao tác quá nhanh" + disable nút 10s |

Hook dùng chung (đừng viết lại):

| Hook | Spec |
|---|---|
| `useUrlFilters(defaults)` | `{ values, set, reset }` — mọi filter/sort/page đi qua đây |
| `useAdminList(key, url, params)` | `{ rows, total, isLoading, isError, refetch }`; key phải chứa mọi filter |
| `useBusinessDecision(...)` | mẫu cho "một nguồn sự thật" của quyết định: list + route detail dùng chung confirm/toast/copy |

Button: `.btn` + variant primary/secondary/ghost/danger/danger-ghost, `btn-sm` trong bảng,
`btn-icon` cho action icon-only (bắt buộc `aria-label` + `title`).
Input: `.input/.select/.textarea`, lỗi cạnh field. `<kbd>` style cho gợi ý phím.

## 6. Motion & responsive

- Transition 160ms ease; toast 200ms; sidebar 200ms. Không animation trang trí
  trên trang data. Tôn trọng `prefers-reduced-motion` (đã global).
- Breakpoint 1180px (grid co) / 860px (drawer nav, toolbar/footer xếp dọc, grid 1 cột).
  Test 1440 + 860 + 390; bảng luôn có `.table-scroll`, không tràn ngang.
- Icon-button trong bảng tối thiểu 44px; focus visible outline primary 2px offset 2px.
- Trạng thái không truyền bằng màu đơn thuần — luôn kèm text/icon.

## 7. Luồng cấm (nhắc lại vì từng gây sự cố)

- Không `dangerouslySetInnerHTML` với nội dung user (render as text).
- Không cache presigned URL trong grid; xin URL mới mỗi lần preview; xử lý 403 hết hạn.
- Không gọi route legacy `/moments/*` (thiếu AdminGuard + audit).
- PII (SĐT/email) che mặc định dạng `09•• ••• •28`, click-to-reveal, tự che sau 30s.
- Export CSV: cap 500 dòng + confirm nêu PII không che; **cấm** nút "export all" đồng bộ.
  Hiện **chưa có** lọc khoảng ngày cho export (`createdFrom`/`createdTo`) — thêm vào cả
  DTO list lẫn export cùng lúc khi làm, đừng chỉ thêm cho một bên.
- Không `.catch(() => {})` để nuốt lỗi mạng: người vận hành phải thấy lỗi và có nút Thử lại.

## 8. Checklist cho một trang list mới

Chạy hết trước khi báo done. Mỗi dòng đều grep/kiểm được, không phải cảm nhận.

**Khung & dữ liệu**
- [ ] `ListHeader` (không `PageHeader`), title + count, actions bên phải
- [ ] Filter/sort/page/pageSize nằm trong URL: `useUrlFilters`; reload giữ nguyên view; copy link mở đúng filter
- [ ] Fetch qua `useAdminList`; không có `useEffect(() => { fetch... })` hay `.catch(() => {})`
- [ ] Query key chứa **mọi** filter — đổi filter mà không refetch là bug
- [ ] Server có whitelist sort; default sort nêu lý do (queue = cũ nhất trước)

**Bảng**
- [ ] `data-table--compact`; cột phụ có `col-hide-mobile`; actions dùng `btn-icon` + `aria-label`
- [ ] Click hàng mở chi tiết (route `/:id` hoặc modal 720px — **không** drawer); nút/link trong hàng không kích hoạt click hàng
- [ ] Trạng thái dùng `StatusBadge`/`VerificationBadge`, không tự map màu
- [ ] Cột ngày/số dùng `formatDateTime`/`formatNumber`; id dùng `.k-mono` rút gọn
- [ ] `Pagination` luôn render khi có dữ liệu, có page-size

**Hành động**
- [ ] Bậc xác nhận đúng bảng §3A2 (đảo ngược / ẩn tạm / phá huỷ / diện rộng / không hoàn tác)
- [ ] Bulk: `BulkBar` + preview ≤10 dòng + `requireText`; selection reset khi đổi filter/trang
- [ ] Mọi hành động có hành động đảo ngược, hoặc copy nói rõ là không đảo ngược
- [ ] Mutation chặn double-submit (`busy`), toast nêu tên đối tượng, lỗi hiện message từ server
- [ ] Đọc đúng shape response (`{modified, results}` không phải `{approved, failed}`)

**An toàn & trạng thái**
- [ ] PII che mặc định (`MaskedPII`); CSV có confirm nêu PII + cap 500
- [ ] Loading = skeleton giữ toolbar; rỗng = `EmptyState` phân biệt trống thật vs không khớp lọc; lỗi = `StateBlock` + Thử lại
- [ ] Focus visible; dialog focus-trap; Esc đóng; focus trả về nút đã mở
- [ ] Bàn phím: J/K/Enter/A/R/`?` (nếu là queue); bảng trợ giúp `?`

**Kiểm thử**
- [ ] Vitest cho hành động chính (bulk, restore, filter); `tsc --noEmit`
- [ ] Test tay 1440 / 860 / 390
- [ ] Tab và đường dẫn trực tiếp cùng mở đúng một bản ghi (route `/:id` share được)

Lệnh chốt trước khi báo done:

```bash
cd admin-web && npx vitest run && npx tsc --noEmit
cd chat-backend && npx jest src/admin && ./node_modules/.bin/tsc --noEmit
```

Lỗi `tsc` đã biết, không tính là hỏng (pre-existing, ngoài phạm vi admin):
`scripts/reseed-businesses.ts`, `src/accounts/accounts.service.spec.ts`,
`src/commerce/orders/commerce-orders.service.spec.ts`.

## 9. Công thức dựng trang list mới (~1 page + 1 detail page + 1 detail component)

1. Copy khung `BusinessesPage.tsx`, xoá phần đặc thù nghiệp vụ (SLA bucket, license).
2. `useUrlFilters({ tab, search, page, pageSize, sort, ...filter riêng })`.
3. `useAdminList` → `params` map 1-1 với DTO server; thêm filter mới thì **thêm cả 3 chỗ**:
   DTO list, DTO export, `filter` trong `queryBusinesses` tương đương của module đó.
4. `TABS` + count lấy từ endpoint stats của module (không đếm ở client).
5. Bảng: `ColumnHeader` cho cột sort/lọc được; `cell-title` + `cell-meta`.
6. Hành động: tách logic mutation ra hook `use<Domain>Decision` nếu dùng ở cả list và detail.
7. **Chi tiết = route riêng**, theo mẫu `AuditLogPage` + `AuditLogDetailPage` + `AuditLogDetail`:
   - page mỏng `pages/XDetailPage.tsx`: lấy `:id`, đọc `location.state.from` để back về đúng filter;
   - component `components/XDetail.tsx`: `useQuery` gọi `GET /x/:id` (endpoint riêng, không lọc từ list),
     render `<section className="table-shell detail-card">` + `detail-header`/`detail-card-body`/`detail-bottombar`;
   - list: `onClick` hàng → `navigate('/x/'+id, { state: { from: pathname+search } })`.
8. Server: list/export/search/sort/stats + `GET :id` + index cho tổ hợp filter chính.

Nợ đã biết từ đợt Businesses (làm ở PR riêng, không nhân bản sang trang mới):

- `UsersPage`, `ReportsPage`, `CommerceOrdersPage`, `MusicCatalogPage`
  vẫn dùng `PageHeader` + filter `useState`/`fetch tay` → lệch §3A.
- `CommerceOrdersPage` đặt filter ngoài `TableShell`, dùng inline style, `sellerId`/`buyerId`
  thô thay vì ô tìm kiếm chung.
- `ReportsPage` dùng `StateBlock variant="empty"` cho lỗi — sai tone, phải `variant="error"`;
  nút "Resolve/Dismiss" chưa Việt hoá (§10).
- Chưa trang nào có lọc theo khoảng ngày (`createdFrom`/`createdTo`) cho **list/export**.
  Audit log đã có `from`/`to` — đó là mẫu để copy khi thêm cho list/export khác.
- `BulkBar` chưa generic: chữ "Duyệt/Từ chối" hardcode theo nghiệp vụ business.
- Chưa có guard chống ghi đè: hai moderator sửa cùng hồ sơ, người sau thắng im lặng
  (không `updatedAt`/version). Khi làm: PATCH gửi `updatedAt` đã đọc, server trả 409
  nếu lệch, trang chi tiết hiện "Hồ sơ vừa được người khác sửa".
- **3 trang còn dùng drawer** (`variant="drawer"`) trái quyết định §3B — chuyển sang
  route/component chi tiết: `ReportDrawer` (báo cáo), `UsersPage` (UserDetailDrawer),
  `ConversationsPage` (hội thoại). Làm ở PR riêng vì mỗi trang cần route + endpoint detail.
- `BusinessDetailDrawer` tên file còn chữ "Drawer" nhưng hình thức đã là modal 720px
  (`dialog--wide`); đổi tên thành `BusinessDetail` khi có dịp sửa file đó.
- Badge "nghi trùng" mới có trong drawer, chưa có trên hàng của bảng — moderator phải
  mở từng hồ sơ mới biết.
- **Drawer trên list không vào URL**: `BusinessesPage` dùng `setDetailId`, nên không share
  được "đang xem hồ sơ nào". Muốn share phải sang route `/businesses/:id`. Cách sửa đúng:
  thêm `id` vào `useUrlFilters` cho drawer và để route detail dùng cùng nguồn đó.
- Phân công mới đi một chiều: `bulk-assign` không gửi `assignee` = nhận về mình; chưa có
  picker chọn moderator khác (chưa có endpoint danh sách admin) và chưa có nút gỡ phân công
  trên UI dù server đã hỗ trợ `assignee: ''`.
- Bulk action ghi **một** dòng audit với `targetId = ids.join(',')`; muốn soi từng hồ sơ
  phải đọc `verificationHistory[]`. Đừng bỏ field này khi refactor.
- `verificationHistory[]` **có** `actorId` cho approve/reject/disable/enable nhưng drawer
  chưa hiện (chỉ hiện `reason` + `at`). Muốn hiện tên người thao tác phải resolve id → tên
  giống `AdminAuditService.list()` đang làm cho audit log.

## 10. Ngôn ngữ & copy (chuẩn hoá, không tuỳ hứng)

Tiếng Việt, giọng vận hành — nói việc xảy ra và việc tiếp theo, không cảm thán.
Đại từ: "hồ sơ", "doanh nghiệp", "người dùng" (không gọi "bản ghi", "record", "item").
Không trộn tiếng Anh trừ thuật ngữ đã quen (CSV, ID, SLA).

| Loại | Khuôn | Ví dụ đúng |
|---|---|---|
| Toast thành công | `Đã {động từ} {đối tượng}.` + bước tiếp nếu có | "Đã duyệt Công ty A. Tiếp theo: Công ty B." |
| Toast thành công có hoàn tác | + nêu cách quay lại | "Đã xoá hồ sơ — xem lại ở tab Lưu trữ nếu cần khôi phục." + nút "Xem lưu trữ" |
| Toast lỗi | `{Việc} thất bại.` + `Vui lòng thử lại.` hoặc message từ server | "Duyệt thất bại. Vui lòng thử lại." |
| Toast lỗi một phần (bulk) | `Đã {động từ} X/Y …` + tối đa 3 lỗi + `(+N)` | "Đã duyệt 4/6 hồ sơ. Lỗi: đã xử lý; không tìm thấy (+1)" |
| Confirm tiêu đề | câu hỏi có đối tượng | "Xoá hồ sơ doanh nghiệp?" |
| Confirm mô tả | hệ quả + có khôi phục được không | "Hồ sơ bị xoá mềm, không hiện trong danh sách nhưng vẫn giữ trong DB để đối soát." |
| Empty thật | nêu vì sao trống | "Chưa có hồ sơ nào… Hồ sơ sẽ xuất hiện ở đây khi doanh nghiệp đăng ký." |
| Empty do lọc | nêu lọc + lối thoát | "Bộ lọc hiện tại không khớp. Gỡ bớt điều kiện để xem thêm." + nút "Xoá bộ lọc" |
| Lỗi tải | nguyên nhân đọc được + nút | "Không tải được danh sách" / "Kiểm tra kết nối rồi thử lại." + "Thử lại" |
| Nhãn nút | động từ + đối tượng, ≤4 từ | "Duyệt hồ sơ", "Nhận hồ sơ", "Khôi phục hồ sơ" |

Cấm:
- "Thao tác thất bại" trần trụi khi biết lỗi nào (đang có ở vài trang — nợ §9).
- "Đã lưu 3 thay đổi" khi server có thể đã bỏ qua field (xem bug `displayName` cũ):
  chỉ báo số field server **thực sự** ghi.
- Nhãn dịch nửa vời: "Resolve/Dismiss" trên trang Báo cáo phải là "Đã xử lý/Bỏ qua".
- Dùng cùng một từ cho hai khái niệm khác nhau. Ba khái niệm tách biệt, copy phải nói rõ:
  **Vô hiệu hoá = tạm ngưng bán** · **Cấm = khoá đăng nhập + thu hồi phiên** ·
  **Xoá = khỏi danh sách, khôi phục được**.
