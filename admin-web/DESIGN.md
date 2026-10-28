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
| Nhiều filter (>3 điều kiện) | **1 ô tìm kiếm chính** (gộp những gì người ta thật sự gõ) + `FilterPopover` có badge số điều kiện + chip. **Cấm** nhét 5–6 control vào một hàng: wrap thành 2–3 dòng đẩy bảng xuống |
| Ngày tháng | trong `FilterPopover`, 2 ô cạnh nhau với mũi tên `→`; chip hiện `dd/mm/yyyy → dd/mm/yyyy` cắt từ ISO, **không** qua `new Date()` (lệch múi giờ làm chip sai một ngày) |
| Chọn dòng | reset selection khi tab/filter/page đổi; chỉ chọn được trang hiện tại |
| Empty | phân biệt "trống thật" vs "không khớp lọc" — copy khác nhau + nút "Xoá bộ lọc" khi có lọc |
| Error | `StateBlock variant="error"` + nút Thử lại gọi `refetch()`. **Cấm** nuốt lỗi (`.catch(() => {})`) |
| Mutation | busy chặn double-submit; toast nêu tên đối tượng; hoàn tác được thì có nút Hoàn tác |
| PII | `MaskedPII` cho mọi SĐT/email trên bảng. CSV xuất không che nhưng phải confirm |
| Export | `ExportButton` + dialog nêu phạm vi, cap 500 dòng, cảnh báo dữ liệu nhạy cảm |
| Bàn phím | J/K di chuyển, Enter mở, A/R quyết định, `?` mở bảng trợ giúp |
| Mobile ≤860px | ẩn cột phụ bằng `.col-hide-mobile`; ≤560px ẩn thêm `.col-hide-xs` và đưa dữ liệu đó vào dòng meta bằng `.show-xs`. Bảng hạ `min-width` (760 → 520 → 0) để không phải vuốt ngang |

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

**Field sửa được của một tài khoản** (`PATCH /admin/users/:id`) — chỉ những gì
moderator cần khi hỗ trợ người dùng: `displayName`, `username`, `email`, `phone`,
`bio`, `internalNote`. Cấm PATCH `accountType`, `isBanned`, `isPlatformAdmin`,
`passwordHash` — ba cái đầu có endpoint riêng (audit + side effect riêng), mật
khẩu admin không được đặt hộ. Đổi `email`/`phone` phải kiểm trùng trước (409 đọc
được, không để E11000 thành 500); đổi `email` phải thu hồi mọi phiên vì JWT mang
email claim.

Thang mức độ hành động — chọn đúng bậc, không nhảy cóc:

| Bậc | Ví dụ | Confirm | requireText |
|---|---|---|---|
| Đảo ngược, hẹp | duyệt, khôi phục, gỡ cấm | ConfirmDialog thường | — |
| Thu hồi phiên (không đảo ngược) | đăng xuất mọi thiết bị | ConfirmDialog thường + nêu rõ access token sống tới 1h | — |
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

### B2. Không hiển thị dữ liệu thô cho moderator

Người dùng trang này ra quyết định, không debug hệ thống. Mọi giá trị kỹ thuật
phải được dịch hoặc giấu sau "Chi tiết kỹ thuật".

| Dữ liệu thô | Cấm hiện | Hiện thay bằng |
|---|---|---|
| ObjectId (`6adec9ac…`) | cột/hàng chính | tên bản ghi; mã đầy đủ chỉ trong `details` "Chi tiết kỹ thuật" |
| JSON payload (`{"internalNote": "…"}`) | `<pre>` ở thân trang | `description-list` với nhãn tiếng Việt (`AUDIT_FIELD_LABELS`); JSON gốc trong `details` |
| Slug (`retail`, `supplier`, `food-beverage`) | nguyên slug | `categoryVi()` / `RELATIONSHIP_VI` |
| Enum (`business`, `verified`) | nguyên enum | nhãn tiếng Việt qua map cố định |
| Raw ms / giá | `180000`, `250000` | `3 phút`, `250.000đ` |
| IP nội bộ (`::ffff:192.168…`, `127.0.0.1`, `10.x`) | hiện như IP thật | ẩn hẳn (`isInternalIp()`); IP public bỏ tiền tố `::ffff:` |
| Mảng id (`ids: [3 id]`) | lặp lại danh sách đối tượng | số lượng; danh sách tên đã hiện ở block trên |
| Key lạ chưa có nhãn | gán nhãn tiếng Việt giả | gom vào "Chi tiết kỹ thuật" với tên field gốc |

Nguyên tắc: **mỗi dòng trên màn hình phải trả lời được "người vận hành cần biết
điều này để làm gì"**. Không trả lời được → ẩn sau `details` hoặc bỏ.

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
| `FilterPopover` | nút "Bộ lọc" + badge số điều kiện đang bật → panel neo dưới nút (portal, 380px). Dùng khi filter > 3 điều kiện: ô search chính + panel + chip, thay vì nhét hết vào một hàng |
| `BulkBar` | chỉ render khi `count > 0`; badge count + preview 3 tên + nút bulk + Bỏ chọn; class CSS `.bulk-bar`, cấm inline style |
| `Pagination` | luôn render khi `total > 0` (kể cả 1 trang) để tổng số không biến mất; page-size + goto cho queue |
| `ExportButton` | nút + dialog confirm nêu phạm vi (cap 500, PII không che) |
| `MaskedPII` | SĐT/email che mặc định, click reveal, tự che 30s |
| `StatusBadge` / `VerificationBadge` | mapping cố định: verified/success → success; pending → warning; banned/rejected → danger; unknown/absent → muted |
| `ConfirmDialog` | focus-trap; destructive + reason bắt buộc; thứ tự nút **confirm trước, Hủy sau**; slot `preview` tóm tắt; `requireText` theo §3A2 |
| `StateBlock` | loading/error có nút Thử lại; `EmptyState` cho rỗng, có `action` khi đang lọc |
| `AuditLogDetail` | chi tiết audit inline: header + `description-list` + payload đã dịch + `details` "Chi tiết kỹ thuật". Route `/audit-logs/:id`, không overlay |
| `UserDetail` | chi tiết người dùng inline ở route `/users/:id`: header (avatar/tên/badge cấm/quản trị) → banner vi phạm/xoá mềm → `detail-section` sửa từng field → ghi chú nội bộ → lịch sử vi phạm → bottombar (thu hồi phiên / cấm / xoá mềm). Dùng `useViolationHistory` + `.fields-editable` để hiện bút sửa |
| `user-labels.tsx` | `accountTypeLabel()`, `banBadge()` — nhãn loại tài khoản + trạng thái cấm dùng chung bảng và chi tiết |
| `audit-labels.ts` | một nguồn nhãn: action, target, field payload (`AUDIT_FIELD_LABELS`), `auditPayloadRows()` dịch giá trị (slug→tiếng Việt, mảng→số lượng, ngày→dd/mm), `isInternalIp()` |
| `detail-card` + `detail-header`/`detail-card-body`/`detail-bottombar` | khung chi tiết inline dùng chung cho route `/:id` — header (avatar/tên/badge) → body → bottombar |
| `LicensePreview` | preview + lightbox 720px trước khi duyệt/gỡ — gỡ mù là cấm. Prop `label` cho ảnh không phải giấy phép |
| `Toast` | feedback sau mutation; 429 = warning "thao tác quá nhanh" + disable nút 10s |

Hook dùng chung (đừng viết lại):

| Hook | Spec |
|---|---|
| `useUrlFilters(defaults)` | `{ values, set, reset }` — mọi filter/sort/page đi qua đây |
| `useAdminList(key, url, params)` | `{ rows, total, isLoading, isError, refetch }`; key phải chứa mọi filter |
| `useBusinessDecision(...)` | mẫu cho "một nguồn sự thật" của quyết định: list + route detail dùng chung confirm/toast/copy |
| `useViolationHistory(userId, accountType)` | báo cáo + audit của một tài khoản; lọc ở server theo `targetType`/`targetId`. Doanh nghiệp thì tra `targetType: 'business'` (lệnh cấm ghi ở đó), không phải `user` |

Button: `.btn` + variant primary/secondary/ghost/danger/danger-ghost, `btn-sm` trong bảng,
`btn-icon` cho action icon-only (bắt buộc `aria-label` + `title`).
Input: `.input/.select/.textarea`, lỗi cạnh field. `<kbd>` style cho gợi ý phím.

### 5.1 Ô nhập có cấu trúc — cấm `<input>` trần cho dữ liệu có định dạng

**Nguyên tắc: hiển thị có định dạng, lưu trữ không đổi.** Giá trị gửi lên API giữ
nguyên shape cũ (`number` VND, chuỗi SĐT `0…`, chuỗi ngày ISO); chỉ lớp hiển thị
đổi. Không migration, không đổi DTO.

| Loại dữ liệu | Component | Hiển thị khi gõ | Gửi lên API |
|---|---|---|---|
| Tiền VND | `<MoneyInput>` | `1.234.567` (dấu chấm hàng nghìn) | `parseVnd(v)` → số nguyên |
| SĐT Việt Nam | `<PhoneInput>` | `091 234 5678`, cố định `028 3773 1122`, quốc tế `+84 912 345 678` | `normalizeVnPhone(v)` → `0…` hoặc `+84…` |
| Số nguyên (MST, thời lượng) | `<IntegerInput maxLength>` | chỉ chữ số, cắt theo maxLength | chuỗi số |
| Ngày | `<input type="date">` | date picker của trình duyệt | `YYYY-MM-DD` |
| Email / URL | `type="email"` / `type="url"` | bàn phím đúng, không autocorrect | chuỗi |

Helper nguồn: `src/components/input-masks.ts` (`VN_PHONE`, `normalizeVnPhone`,
`formatVnPhone`, `maskVnPhone`, `formatVndInput`, `parseVnd`, `formatVnd`,
`formatIntegerInput`). Component: `src/components/StructuredInput.tsx`.

Quy tắc bắt buộc:

- **Không dùng `type="number"`.** Cho phép gõ `e`, `+`, `-`; mất số 0 đầu
  (`0912…` → `912…`); hiện spinner. Dùng `type="text"` + `inputMode="numeric"`
  (`type="tel"` cho SĐT) để mở đúng bàn phím mà vẫn kiểm soát ký tự.
- **Con trỏ theo số chữ số, không theo index ký tự.** Chèn dấu phân cách làm
  index lệch → dòng caret nhảy về cuối mỗi lần gõ. `StructuredInput` đã xử lý;
  nếu tự viết input có format thì phải làm tương tự.
- **Rỗng phải ở lại rỗng.** Xoá hết tiền là `''`, không phải `'0'`.
- **SĐT lưu dạng chuẩn hoá, hiển thị có nhóm.** Backend validate trên giá trị đã
  chuẩn hoá (`NormalizeVnPhone()` + `@IsVnPhone()`) nên gõ `028 3773 1122` vẫn
  lưu được — regex cũ chỉ nhận di động 10 số, hồ sơ số cố định không PATCH được.
- **Ngày luôn là `type="date"`**, không nhập chuỗi tự do: `31/02` hay "hết tháng
  sau" trước đây chỉ lỗi sau round-trip.
- **Che PII vẫn phải cho thấy đầu số.** `MaskedPII kind="phone"` dùng
  `maskVnPhone()` → `091 ••• 78` (đủ nhận ra di động/cố định); bấm hiện thì
  `formatVnPhone()` ra dạng có nhóm, không phải chuỗi thô `0912345678`.
- Placeholder minh hoạ đúng định dạng đã format (`89.000`, `091 234 4567`), không
  phải `89000` — người dùng gõ theo cái họ thấy.

Ngoại lệ hợp lệ: ô tìm kiếm/`type="search"` (chuỗi tự do), `type="checkbox"`,
textarea văn bản dài. Mọi field còn lại có cấu trúc thì phải dùng component trên.

### 5.2 Trạng thái & dữ liệu vận hành

Sáu quy tắc dưới đây là hợp đồng giữa admin-web và backend. Trang mới vi phạm một
trong sáu là lỗi, không phải "khác phong cách" — mỗi quy tắc đều từng gây sự cố thật.

#### 5.2.1 Media: server ký, client chỉ render field `*Signed`

`messages.mediaUrl` và `stories.mediaKey` lưu **MinIO object key**, không phải URL;
admin-web không giữ credential MinIO. Vì vậy backend ký lúc đọc và trả thêm field
hậu tố `Signed`, giữ nguyên key gốc cho consumer khác (mobile tự ký).

| Nguồn | Field trả về | Ghi chú |
|---|---|---|
| Tin nhắn (list/chi tiết/tìm kiếm) | `mediaUrlSigned`, `mediaKeyPreviewSigned` | ký cả preview story-reply |
| Story (list + lightbox) | `mediaUrlSigned`, `thumbnailUrlSigned` | dùng chung một lần ký mỗi trang |
| Hồ sơ doanh nghiệp | `licenseImageUrl`, `logoUrl`, `coverUrl` | presign ở detail; list chỉ cần giấy phép |
| Báo cáo | `targetName`/`targetDetail` (chưa có media) | muốn xem ảnh phải bổ sung presign ở server trước |

- **Cấm render object key.** `<img src={mediaUrl}>` là bug đã từng làm vỡ toàn bộ ảnh
  trong trang hội thoại. Chỉ dùng field `*Signed`; key gốc chỉ hiện trong
  "Chi tiết kỹ thuật".
- **`null` nghĩa là ký thất bại, không phải "không có media".** UI hiện "Không tải
  được media"; fallback về key là đường dẫn chết, không phải graceful degradation.
- **Ký lúc đọc, không lưu DB và không cache toàn cục.** URL sống 60 phút; mở lại
  preview thì xin lại. Gặp 403/hết hạn → gọi lại endpoint, không hiện ảnh hỏng.
- **Ký theo lô, lỗi từng key độc lập.** Một object mồ côi không được kéo cả trang về
  `null`; trần 60 key/lần (vượt trần trả `null`) để payload không phình.

#### 5.2.2 Mọi mutation admin đều ghi audit

Thao tác ghi nào của admin cũng phải để lại một dòng `AdminAuditLog` — kể cả xoá
mềm/khôi phục, sửa cấu hình, gửi broadcast, quyết định kháng nghị.

- `action`/`targetType` lấy từ `ADMIN_AUDIT_ACTIONS` và `ADMIN_AUDIT_TARGET_TYPES`:
  một nguồn cho union type, DTO lọc và nhãn UI. Thêm hành động mới = thêm vào hằng
  số + `audit-labels.ts`, **không** cast `as unknown as`.
- `targetType` theo nơi người vận hành sẽ tra: thao tác trên tài khoản doanh nghiệp
  ghi `business` (timeline hồ sơ lọc theo đó), không ghi `user`.
- Payload là bản **đã redact**: không token, password, secret, recovery code. Không
  đặt tên field chứa chữ `token` cho id phiên (dùng `sessionId`) — bộ lọc redact bắt
  theo tên key.
- Bulk ghi **một dòng cho mỗi hồ sơ đã xử lý** (`targetId` = id của hồ sơ đó,
  `payload.batchSize` cho biết lô lớn bao nhiêu). Ghi một dòng gộp
  `targetId = ids.join(',')` là sai: timeline từng hồ sơ lọc theo `targetId` nên
  lệnh duyệt hàng loạt biến mất khỏi đó, và
  `openspec/specs/admin-business-verification` yêu cầu rõ "each item SHALL write
  an audit entry".
- Tiến trình hệ thống (cron gỡ ban…) ghi `actorId = 'system'` + `payload.reason` nêu
  nguồn, để audit không có dòng "ai làm" trống.
- Ghi audit hỏng **không** được làm hỏng thao tác đã thành công — chỉ log cảnh báo.

#### 5.2.3 Mọi list admin phân trang và có đủ ba trạng thái

- Server bắt buộc `page`/`limit` (mặc định 20, trần 100; export trần 500) và trả
  `{ data, total, page, limit }`. Không endpoint nào trả cả bảng.
- `total` phải `countDocuments` trên **cùng filter** với `data`; đếm ở client sẽ lệch
  ngay khi filter nằm ở server.
- UI: `Pagination` render khi `total > 0`; rỗng thật và rỗng do lọc là hai copy khác
  nhau; lỗi là `StateBlock variant="error"` + nút "Thử lại", cấm `.catch(() => {})`.
- Count trên tab lấy từ endpoint stats của module, không đếm mảng đã tải.
- Endpoint export dùng chung filter với list và trả `{ data, total, truncated }` để
  UI nói được "còn dữ liệu chưa xuất".

#### 5.2.4 Token xem thay chỉ đọc

- Token impersonate TTL 5 phút, **không** có refresh; payload `sub` = người bị xem
  thay, `act` = admin gốc, `imp = true`.
- `JwtAuthGuard` chặn mọi method ngoài `GET/HEAD/OPTIONS` khi `imp` — chốt ở guard,
  không dựa vào từng controller tự nhớ kiểm tra.
- Không xem thay chính mình hoặc tài khoản quản trị khác: đó là mượn quyền, không
  phải debug khiếu nại.
- Audit chỉ ghi `expiresIn`; không bao giờ đưa token vào payload hay log.
- UI: banner cố định + đếm ngược, tự thoát khi hết hạn; cất token admin vào
  `sessionStorage` để có đường về. Thiếu chỗ lưu thì **từ chối bắt đầu** — thà không
  xem được còn hơn kẹt ở token người dùng.
- Nút bắt đầu phải nằm ở trang chi tiết người dùng; chỉ mount banner mà không có
  điểm vào là tính năng chết.

#### 5.2.5 2FA TOTP tự viết, không thêm dependency

- RFC 6238 thuần `crypto` (HMAC-SHA1, bước 30s, 6 số, base32). Chấp nhận lệch ±1
  bước để bù đồng hồ thiết bị. **Không** kéo thêm thư viện OTP.
- `/auth/2fa/*` chỉ thao tác trên **người gọi token**: admin không bật/hộ 2FA cho
  người khác, nên panel chỉ hiện khi mở đúng hồ sơ của mình.
- Secret và recovery code không xuất hiện ở bất kỳ projection admin nào
  (`SAFE_PROJECTION` loại `twoFactorSecret`/`twoFactorRecoveryCodes`).
- Recovery code trả plaintext **một lần**, DB lưu SHA-256; dùng xong phải xoá khỏi
  mảng ngay trong cùng request.
- Không lưu mã OTP vào DB ở bất kỳ luồng nào.

#### 5.2.6 Broadcast phải chọn đối tượng và ghi lịch sử

- `audience` thuộc enum dùng chung `BROADCAST_AUDIENCES`
  (`all | personal | business | ids`). `audience=ids` mà rỗng là 400 (đừng ghi log
  "đã gửi" cho 0 người); id trùng được dedupe; trần 500 id.
- Mỗi lần gửi ghi một `BroadcastLog` (title/body/audience/ids/sentBy/
  `recipientsOnline`) **và** một dòng audit chỉ chứa số lượng — không nhét hàng trăm
  ObjectId vào payload audit.
- Lịch sử đọc qua `GET /admin/broadcast-history` (phân trang, trần 100/trang).
- `recipientsOnline` là số socket khớp tại thời điểm emit, không phải số người nhận
  thật; copy UI phải nói "đang online". Lỗi gateway không được làm mất log.
- Chưa có FCM fallback cho người offline và chưa có lịch gửi; `personal`/`business`
  hiện fanout toàn bộ nhưng vẫn ghi audience để đối soát khi gửi lại đúng nhóm.

#### 5.2.7 `@Prop({ type: Types.ObjectId })` là bug — phải dùng `SchemaTypes.ObjectId`

Không phải quy ước đặt tên: `@nestjs/mongoose` quyết định giữ nguyên type bằng
`isMongooseSchemaType()`, và `Types.ObjectId` là class BSON nên **trượt** kiểm tra →
nestjs thay bằng `{}` → mongoose tạo path `Mixed` → **chuỗi ObjectId không được cast**.

Hệ quả thật đã gặp và phải sửa: `refreshtokens.userId` là `Mixed`, nên
`{ userId: '6ad…' }` khớp 0 bản ghi. Nghĩa là `revoke-sessions` trả `{revoked: 0}`,
ban không đá được phiên, danh sách thiết bị luôn rỗng — trong khi mọi test đơn vị
(mock model) vẫn xanh vì không đi qua cast thật.

- Đúng: `@Prop({ type: SchemaTypes.ObjectId, ref: 'User' })`. Nếu chỉ cần kiểu TS
  chứ không cần query theo field thì `@Prop()` với `design:type` là đủ.
- Phát hiện: `schema.path('x').instance === 'Mixed'` trên schema đã build là dấu hiệu.
- Đã có test chốt (`src/auth/refresh-token.schema.spec.ts`): refresh token,
  user-conversation, member, conversation, ownerUserId.
- Kiểm tra chéo khi thêm schema: viết query bằng **chuỗi id** trong một spec chạm
  schema thật, không chỉ mock — mock không bao giờ thấy lỗi này.

#### 5.2.8 Vai trò `support` chỉ đọc — chốt ở `AdminGuard`, không ở từng route

- `AdminGuard` chạy sau `JwtAuthGuard` trên **mọi** controller `/admin/*`, đọc lại
  `adminRole` từ DB rồi chặn mọi method ngoài `GET/HEAD/OPTIONS` khi vai trò là
  `support`. Đặt ở guard thay vì rải `@RequireRole` vì route thêm mới không thể lọt
  lưới — bảo vệ mặc định thay vì bảo vệ theo trí nhớ.
- `@RequireRole('super')` chỉ dùng để siết **thêm** (moderator cũng không được xoá
  user, thu hồi toàn bộ phiên, cấp token xem thay, đổi hoa hồng, sửa cấu hình).
- `adminRole` null (admin cũ) = `super`; guard fail-closed khi thiếu `request.adminRole`
  (sai thứ tự guard) để lỗi cấu hình không âm thầm mở quyền.
- UI ẩn nút theo `useAdminRole()` chỉ để đỡ bấm-rồi-ăn-403; quyền thật do backend quyết.

#### 5.2.9 Deep-link `focus` phải có endpoint đọc-một-đối-tượng

- Link từ trang báo cáo dùng `?focus=<id>`; mỗi trang đích tự tải đối tượng qua
  endpoint riêng (`GET /admin/conversations/:id`, `/admin/messages/:id`,
  `/admin/stories/:id`) thay vì tìm trong danh sách đã phân trang.
- Endpoint đọc-một **không** lọc `deleted`/`isActive`: moderator mở để xem lại nội
  dung đã gỡ — đó chính là lúc cần nhất.
- Chỉ trả link khi trang đích thật sự đọc param (DESIGN §0.7). Đóng khối/drawer focus
  thì xoá param để reload không bật lại.

## 6. Motion & responsive

- Transition 160ms ease; toast 200ms; sidebar 200ms. Không animation trang trí
  trên trang data. Tôn trọng `prefers-reduced-motion` (đã global).
- Breakpoint 1180px (grid co) / 860px (drawer nav, toolbar/footer xếp dọc, grid 1 cột).
  Test 1440 + 1024 + 860 + 390; bảng luôn có `.table-scroll`, không tràn ngang.
- **Một scroller duy nhất:** `.admin-content-scroll`. Topbar + sidebar nằm ngoài
  vùng đó nên đứng yên khi cuộn. Cấm đặt `max-height`/`overflow-y` cho khung bảng
  trên trang list (`.table-scroll--fit` chỉ `overflow: visible`) — trước đây
  `max-height: calc(100vh - 470px)` làm laptop 768px chỉ hiện 4 dòng trong một ô
  cuộn nhỏ giữa trang, và `.table-shell { overflow: hidden }` biến chính khung
  bảng thành scroll container khiến thead `sticky` trôi mất. Nay `.table-shell`
  dùng `overflow: clip` (giữ bo góc, không tạo scroll container).
- ≤1099px ẩn `.col-hide-xs` và hạ `.data-table { min-width: 0 }`: nội dung chỉ
  còn ~700px sau sidebar, nhưng nếu để bảng tràn thì phải bật `overflow-x`, mà
  `overflow-x: auto` kéo theo `overflow-y: auto` → thead hết sticky. Cùng mốc đó
  `.col-sticky` chuyển về `position: static` — sticky chỉ có nghĩa khi bảng cuộn
  ngang, để nguyên thì cột Hành động đè lên cột dữ liệu cuối.
- **Cột bị ẩn phải có đường về:** dữ liệu không được biến mất khỏi bảng. Mỗi cột
  ẩn theo bề ngang cần một dòng `.show-under-1100` / `.show-under-860` / `.show-xs`
  tương ứng nằm trong ô đầu của hàng, và ô gốc phải gắn đúng lớp ẩn
  (`.col-hide-xs` mốc 1099, `.col-hide-xxs` mốc 560, `.col-hide-mobile` mốc 860).
  Ba lớp `show-*` tách riêng vì mốc ẩn khác nhau — dùng `.show-xs` cho cột ẩn ở
  1099px là mất dữ liệu suốt khoảng 560–1099px.
- ≤560px: siết padding ô bảng xuống 10px và cho `.badge` trong bảng xuống dòng.
  Nhãn hành động dài ("Cập nhật tài khoản") một dòng rộng 160px, tự nó đẩy cột
  Hành động ra ngoài khung 358px của 390px.
- ≤820px cao (1366×768, 1440×900 trừ browser chrome): nén `.admin-content` padding
  xuống `16px 24px`, `.page-stack` gap 24px để bảng còn thêm ~2 dòng.
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
- [ ] Ô nhập có cấu trúc dùng `MoneyInput`/`PhoneInput`/`IntegerInput`/`type="date"` (§5.1); không có `type="number"` cho tiền/SĐT/ngày

**Hành động**
- [ ] Bậc xác nhận đúng bảng §3A2 (đảo ngược / ẩn tạm / phá huỷ / diện rộng / không hoàn tác)
- [ ] Bulk: `BulkBar` + preview ≤10 dòng + `requireText`; selection reset khi đổi filter/trang
- [ ] Mọi hành động có hành động đảo ngược, hoặc copy nói rõ là không đảo ngược
- [ ] Mutation chặn double-submit (`busy`), toast nêu tên đối tượng, lỗi hiện message từ server
- [ ] Đọc đúng shape response (`{modified, results}` không phải `{approved, failed}`)

**An toàn & trạng thái**
- [ ] PII che mặc định (`MaskedPII`); CSV có confirm nêu PII + cap 500
- [ ] Không ObjectId/JSON/slug/enum thô ở thân trang — theo bảng §3B2; mã đầy đủ chỉ trong `details`
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

- `ReportsPage`, `CommerceOrdersPage`, `MusicCatalogPage`
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
- **1 trang còn dùng drawer** (`variant="drawer"`) trái quyết định §3B — chuyển sang
  route/component chi tiết: `ConversationsPage` (hội thoại). `UsersPage` đã chuyển sang
  `/users/:id` + `UserDetail`.
- **Trang Hội thoại & Tin nhắn chưa đọc param `focus`**: `ReportTargetLink` cũ trỏ tới
  `/conversations?focus=<id>` và `/messages?focus=<id>` nhưng hai trang bỏ qua param →
  moderator bấm vào thấy trang trống. Đã bỏ link chết (`reportTargetHref` trả null);
  khi thêm `focus` thì bật lại một dòng ở đó.
- **Báo cáo story không xem được ảnh**: report targetType story chỉ resolve được caption,
  ảnh cần presigned URL + lightbox (`LicensePreview` đã có, chỉ thiếu presign ở server).
- **Seed data `_id` dạng chuỗi** (`scripts/seed-admin-reports.ts` tạo `seed-report-1`):
  `findOne` đã fallback đọc collection, nhưng targetId cũng là chuỗi nên không resolve
  được tên → list hiện "Đối tượng không còn tồn tại". Nên đổi seed sang ObjectId thật.
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
