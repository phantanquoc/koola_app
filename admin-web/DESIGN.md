# DESIGN.md — Admin Console Visual Language

Ngôn ngữ giao diện cho `admin-web`: **công cụ vận hành, không phải trang marketing**.
Người dùng là moderator/operator xử lý hàng trăm ticket mỗi ngày — mọi pixel phục vụ
quyết định nhanh: mật độ cao, quét được bằng mắt, làm được bằng bàn phím.

> DNA marketing (ElevenLabs/Waldenburg/hero) nằm ở `koola_app/DESIGN.md` — KHÔNG áp dụng ở đây.
> Mobile có DNA riêng: `openspec/ui-dna.md` — KHÔNG áp dụng ở đây.
> Token sống trong `src/index.css` (`:root`); component kit sống trong `src/components/`.

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

Thứ tự dọc duy nhất:

```
PageHeader gọn (title 20-24px + count + actions)
→ FilterBar (search + selects + date-range, wrap được)
→ BulkBar (chỉ hiện khi count > 0, sticky dưới toolbar)
→ Table (compact, sticky header, cột actions sticky phải)
→ Footer (tổng số + pagination)
```

- Filter đang active hiện dạng chip row dưới toolbar, mỗi chip xóa được.
- Sort mặc định: queue kiểm duyệt = cũ nhất trước (kèm cột Tuổi).
- Không trang trắng: loading = skeleton rows, rỗng = EmptyState, lỗi = StateBlock + retry.

### B. Trang detail — drawer hay route?

- **Drawer 480px** khi xem nhanh từ queue (moderation context, preview license/media).
  Đóng drawer quay lại đúng vị trí queue (giữ URL filter).
- **Route riêng** (`/users/:id`, `/conversations/:id`) khi cần deep-link/share
  hoặc nội dung dài. Nội dung: header (avatar + tên + badge trạng thái + actions)
  → description-list → block ngữ cảnh (tin nhắn/report cũ) → timeline/audit.
- Không mở tab mới ở bất kỳ bước nào.

### C. Dashboard —marketing duy nhất được phép to

- KPI row: MetricCard gọn (label 13px + value 28–32px/800 + delta/helper),
  **không orb trang trí**. Click KPI deep-link tới trang list đã lọc sẵn.
- Chart (recharts): series dùng tone-dark theo ngữ nghĩa; grid hairline;
  time-range = segmented control; range rỗng = EmptyState, không vẽ trục trống.

### D. Form/mutation — dialog/drawer

- Dialog 520px cho confirm/form ngắn (ban/reject/soft-delete); drawer cho form dài.
- reason = textarea bắt buộc, durationDays = select (1/3/7/30 + vĩnh viễn);
  nút confirm disabled tới khi hợp lệ. Giữ input khi submit lỗi.
- Broadcast: form + panel preview + type-to-confirm "BROADCAST" (không undo).

## 4. Table — spec mật độ (trọng tâm của đợt sửa này)

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
| `PageHeader` | title 20–24px/700 + count + actions; eyebrow CHỈ dashboard |
| `TableShell` | toolbar (title/subtitle + actions) + children + footer built-in |
| `BulkBar` | sticky dưới toolbar: badge count + 2 nút bulk + tóm tắt trước confirm; style bằng class CSS, cấm inline style |
| `FilterBar` | composition từ toolbar + chip row (CSS đã có `.table-toolbar`, `.filter-chip-row`) — không component mới |
| `Tabs` / segmented | pill group, option active nền ink chữ trắng; dùng cho time-range và sub-view |
| `SearchInput` | ô search trong toolbar, có kbd hint `/` khi là global |
| `StatusBadge` | mapping cố định: active/verified/success → success; pending → warning; banned/rejected/error → danger; unknown → muted |
| `Dialog` / `ConfirmDialog` | focus-trap; destructive qua ConfirmDialog + reason bắt buộc; thứ tự nút: **confirm trước, Hủy sau** (mở dialog là Enter chốt luôn); preview slot tóm tắt create/update/delete; `requireText` type-to-confirm cho diện rộng/không undo |
| `Drawer` 480px | moderation context theo thứ tự: nội dung gốc → target info + link → lịch sử cũ (tối đa 5 + deep-link xem tất cả) → actions |
| `Toast` | feedback sau mutation; 429 = warning "thao tác quá nhanh" + disable nút 10s |
| `Pagination` | mọi list; state trong URL |
| `StateBlock` / `EmptyState` / skeleton | cấm trang trắng; skeleton rows cho bảng (1.2s shimmer) |
| `LicensePreview` / lightbox 720px | preview trước khi duyệt/gỡ — gỡ mù là cấm |

Button: `.btn` + variant primary/secondary/ghost/danger/danger-ghost, `btn-sm` trong bảng.
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
- Export CSV: cap số dòng + lọc ngày; cấm nút "export all" đồng bộ.

## 8. Checklist UI trước khi báo done

- [ ] Không double-header; màu/spacing/radius qua `var(--...)`
- [ ] Bảng dùng variant compact; trạng thái qua `StatusBadge` đúng mapping
- [ ] Filter/sort/pagination trong URL; reload giữ view; detail mở trực tiếp được
- [ ] Bulk qua `BulkBar` (class CSS) + tóm tắt trước confirm; diện rộng type-to-confirm
- [ ] Phá hủy qua `ConfirmDialog` + reason; feedback qua `Toast`
- [ ] Loading/empty/error có skeleton/state; không trang trắng
- [ ] Focus visible + Dialog focus-trap + điều hướng bàn phím; phím tắt queue có gợi ý
- [ ] Test 1440/860/390; PII che mặc định; nội dung user render as text

## 9. Code follow-ups (ghi nợ khi viết spec này — làm ở PR riêng)

1. `BulkBar.tsx` đang inline style → chuyển sang class `.bulk-bar` trong `index.css`.
2. `.page-title` clamp(28–40px) + eyebrow bắt buộc → page header gọn theo §3A
   (title 20–24px, eyebrow optional); `.btn-primary` bỏ chữ "pill" trong comment cũ.
3. Thêm class `.data-table--compact` + cột actions sticky + sortable header style.
4. Thêm CSS tabs/segmented control (chưa có).
5. `MetricCard` bỏ orb `::after` trên dashboard (giữ CSS class cho login/empty-state).
6. `.btn-primary:hover` đang nhảy sang chàm — sửa thành ink đậm.
