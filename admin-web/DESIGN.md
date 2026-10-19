# DESIGN.md — Admin Web Visual Language

Chuẩn giao diện duy nhất cho `admin-web`. Mọi trang mới/sửa phải tuân thủ.
Token sống trong `src/index.css` (`:root`); component kit sống trong `src/components/`.

> Mobile có DNA riêng: `openspec/ui-dna.md` — KHÔNG áp dụng ở đây.

## 1. Token (chỉ dùng biến, cấm giá trị thô)

Hướng visual: **light trắng-xám, tone nhạt** (lấy cảm hứng ElevenLabs editorial,
không dark canvas, không màu bão hòa). Nền canvas xám rất nhạt, chữ ink ấm,
điểm nhấn pastel chỉ làm decoration.

- **Nền:** `--koola-canvas: #f5f5f4` (xám ấm nhạt), `--koola-surface: #ffffff`,
  `--koola-surface-soft: #fafaf9`.
- **Chữ:** `--koola-ink: #1c1917` (đen ấm), `--koola-muted: #78716c`,
  `--koola-faint: #a8a29e` — faint (≈2.5:1 trên trắng, FAIL AA) CHỈ làm decoration
  (placeholder mờ, divider icon), CẤM dùng làm chữ đọc được.
- **Đường kẻ:** `--koola-line: #e7e5e4`, `--koola-line-strong: #d6d3d1`
  (hairline 1px — card nổi bằng hairline + shadow nhẹ, không viền đậm).
- **Primary:** `--koola-primary: #4f46e5` (chàm nhạt), `--koola-primary-dark: #4338ca`
  (chữ trên nền primary-soft, ≈7:1 PASS), `--koola-primary-soft: #ede9fe`.
  Không dùng tên `lavender-soft` — trùng giá trị primary-soft, một màu một tên.
- **Accent trang trí:** pastel orb mint `#a7e5d3` / peach `#f4c5a8` /
  lavender `#c8b8e0` / sky `#a8c8e8` — CHỈ làm background decoration
  (login hero, empty-state), KHÔNG làm màu nút, màu chữ, màu badge.
- **Semantic (mỗi tone gồm base + soft + dark; chữ badge LUÔN dùng dark trên nền soft):**
  success `#16a34a` / soft `#dcfce7` / dark `#067647`;
  warning `#d97706` / soft `#fef3c7` / dark `#b45309`;
  danger `#dc2626` / soft `#fee4e2` / dark `#b42318`;
  info: soft `#eff6ff` / dark `#1d4ed8` (không có info base — info không làm màu độc lập);
  muted = surface-soft + muted text. Base (success/warning) FAIL AA làm chữ thường
  nên cấm dùng base cho text — badge/text trạng thái bắt buộc tone-dark.
- **Nút:** `btn-primary` = ink pill (nền `--koola-ink`, chữ trắng, radius pill) —
  đây là CTA duy nhất. `--koola-primary` (chàm) KHÔNG làm nền nút;
  chỉ dùng cho eyebrow, link, focus ring, icon nhấn. Nút danger nền `#dc2626`
  (không dùng ink cho hành động phá hủy).
- **Spacing:** `--space-1..7` = 4/8/12/16/24/32/40px. Không dùng số lẻ ngoài thang này.
- **Radius (gọn hơn):** `--radius-xs/sm/md/lg/xl/pill` = 6/8/12/16/24/999px.
  Input 8px, card 16px, CTA + badge pill.
- **Shadow (một tầng nhẹ):** `--shadow-subtle: 0 4px 16px rgba(0,0,0,0.04)`,
  `--shadow-soft: 0 8px 24px rgba(0,0,0,0.06)`,
  `--shadow-lift: 0 18px 48px rgba(0,0,0,0.10)`.
- **Font:** Inter (`--font-sans`), JetBrains Mono cho mã/số (`--font-mono`, class `.k-mono`).
  Base 15px, line-height 1.5, body tracking +0.15px (editorial). Heading -0.02em.
  Không thêm font display — heading dùng Inter 800 như hiện tại.
- **Quy tắc:** cấm hex/rgb/px cứng trong TSX và CSS mới — mọi giá trị phải qua `var(--...)`.
  Auditor kiểm tra bằng grep `#[0-9a-fA-F]` ngoài `index.css`.

## 2. Bố cục trang (page primitives trong `index.css`)

- Khung: `.page-stack` (cột, gap space-5) → `.page-header` (eyebrow + title + description)
  → nội dung trong `.panel` / `.surface-card` / `.table-shell`.
- Eyebrow: `.page-eyebrow` (primary, 12px, uppercase, tracking 0.08em).
  Title: `.page-title` (clamp 28-40px, 800). Mô tả: `.page-description` (tối đa 720px).
- Content tối đa 1440px, padding space-6 (`.admin-content`).
- Grid metric: `.grid-2/3/4` (tự co ở 1180px). Không tự chế grid mới.

## 3. Kit component (dùng, không chế mới)

| Component | File | Dùng khi |
|---|---|---|
| `PageHeader` | `components/PageHeader.tsx` | đầu mọi trang (eyebrow/title/description/actions) |
| `TableShell` | `components/TableShell.tsx` | mọi bảng (toolbar + scroll + footer built-in) |
| `Pagination` | `components/Pagination.tsx` | mọi list phân trang |
| `StateBlock` / `EmptyState` | `components/StateBlock.tsx`, `EmptyState.tsx` | loading / rỗng — cấm để trang trắng |
| `StatusBadge` | `components/StatusBadge.tsx` | tone success/danger/warning/muted/primary — mọi trạng thái qua đây, không tự tô màu text |
| `MetricCard` | `components/MetricCard.tsx` | số liệu dashboard (variant warning/success/danger đổi vòng trang trí) |
| `Dialog` / `ConfirmDialog` | `components/Dialog.tsx`, `ConfirmDialog.tsx` | confirm hành động phá hủy (ban/takedown/delete/broadcast) — focus-trap có sẵn |
| `Toast` | `components/Toast.tsx` | feedback sau mutation (success/warning/error/info) |
| `BulkBar` | `components/BulkBar.tsx` | bulk-approve/reject — hiện số lượng đã chọn + confirm |
| `SearchInput` | `components/SearchInput.tsx` | ô tìm kiếm trong toolbar |
| `LicensePreview` | `components/LicensePreview.tsx` | preview ảnh giấy phép (thumb 86x58, lightbox 720px) |

- Button: `.btn` + variant `btn-primary/secondary/ghost/danger/danger-ghost`, size `btn-sm`.
  Destructive dùng `btn-danger` (hoặc ghost khi đặt cạnh primary).
- Input: `.input/.select/.textarea` + `.form-field/.form-label`; lỗi hiện cạnh field.
- Badge trạng thái: `.badge-*` (primary/success/warning/danger/muted) — mapping cố định:
  active/verified/success → success; pending → warning; banned/rejected/error → danger;
  unknown/missing → muted. Không tự đặt nghĩa màu mới.

## 4. Pattern theo loại trang

- **Queue kiểm duyệt** (businesses/reports): `.queue-list` + `.queue-item`, cột tuổi ticket
  (tính từ createdAt), sort cũ nhất trước, quá hạn nổi bật. Bulk qua `BulkBar`.
- **Detail drawer/dialog**: `.drawer` (480px, trượt phải) cho xem nhanh;
  `.dialog` (520px, giữa) cho confirm/form ngắn; lightbox 720px cho ảnh.
  Mô tả field dùng `.description-list` (150px + 1fr).
- **Dashboard**: `MetricCard` + recharts (theo AGENTS.md P5). Số lớn 34px/800/-0.04em.
- **Health**: `StatusBadge` 4 dịch vụ + poll 30s (mẫu: `HealthPage.tsx`).
- **Form**: zod validate, lỗi cạnh field, giữ input khi lỗi, disable submit khi invalid/loading.

## 5. Motion & responsive

- Transition chuẩn 160ms ease (hover/focus). Toast vào 200ms, sidebar mobile 200ms.
- Shimmer skeleton (`.skeleton-line/.skeleton-card`, 1.2s) cho loading bảng — không spinner trơ.
- Breakpoint: 1180px (grid co), 860px (sidebar thành drawer + backdrop, toolbar/footer
  xếp dọc, grid/login 1 cột). Mọi trang mới test ở 1440 + 860 + 390.
- `prefers-reduced-motion: reduce` đã xử lý global trong CSS — không thêm animation
  nào phá vỡ nó (không dùng `!important` đè).

## 6. Cấm

- Không hex/px cứng ngoài `index.css`; không class CSS mới nếu kit đã có;
  không component UI mới khi kit đáp ứng được; không thêm lib UI
  (shadcn/MUI/tailwind) — giữ hand-rolled CSS.
- Không `dangerouslySetInnerHTML` với nội dung của user (render as text).
- Không convey trạng thái bằng màu đơn thuần — luôn kèm text/icon (`StatusBadge`).
- Không trang trắng khi loading/error/empty — luôn `StateBlock`/`EmptyState`/skeleton.

## 7. Visual cho các mục checklist AGENTS.md (trước đây chưa có chuẩn)

- **Environment banner:** thanh mỏng 32px trên cùng, chữ 12px/800 uppercase.
  DEV = nền primary-soft, chữ primary-dark. PROD = nền danger-soft,
  chữ danger-dark + thêm dấu "PROD". Không dùng màu chói, nhưng PROD phải nhận ra ngay.
- **Queue aging:** cột "Tuổi" mono font; <24h muted; 24-72h warning badge;
  >72h danger badge + hàng có viền trái 3px danger. Sort mặc định cũ nhất trước.
- **Keyboard hint:** `<kbd>` style — nền surface-soft, hairline border, radius 6px,
  mono 12px, padding 2px 6px. Gợi ý phím đặt dưới queue (`j/k` di chuyển…).
- **PII mask:** SĐT/email nhạy cảm hiện dạng `09•• ••• •28` + nút ghost "Hiện"
  (eye icon). Reveal tối đa 30s rồi tự che lại.
- **Type-to-confirm:** dialog danger, ô input yêu cầu gõ đúng cụm từ
  (VD tên target), nút xác nhận disabled cho tới khi khớp.
- **Idle warning:** toast warning + dialog đếm ngược 60s trước khi hết hạn;
  sau login lại redirect về đúng trang đang làm (kèm query params).
- **Empty-state trang trí:** orb pastel (mint/peach/lavender/sky) radial mờ
  sau nội dung empty — chỗ duy nhất được dùng accent ngoài badge/chip.

## 8. App-shell (sidebar + topbar + banner + identity)

- **Environment banner** 32px nằm TRÊN CÙNG toàn app (trên cả sidebar lẫn content),
  chữ 12px/800 uppercase: DEV = nền primary-soft, chữ primary-dark;
  PROD = nền danger-soft, chữ danger-dark + prefix "PROD".
- **Sidebar** desktop width 264px, full height, nền surface; item cao 44px,
  radius md; item active = nền primary-soft + chữ primary-dark (không dùng ink pill
  cho nav — ink pill chỉ dành cho CTA). Section label 11px uppercase tracking.
  Transition thu gọn/mở rộng 200ms ease (width + padding).
- **Brand:** logo Koola thật, căn giữa (`/koola-logo.png` rộng 104,
  `/koola-mark.png` rộng 40 cho rail thu gọn) — chỉ logo, không kèm text.
  Không dùng tile icon + text "Koola Admin / Operations console"
  (logo đã có chữ KOOLA + slogan).
- **Thu gọn sidebar:** nút ghost 36px trên header (ChevronsLeft/Right, ẩn ở
  mobile), rail 76px icon-only; section label ẨN hẳn khi collapse, các nhóm
  ngăn nhau bằng hairline divider; nav link + logout hiện tooltip qua `title`;
  trạng thái lưu `localStorage` (`koola-admin:sidebar-collapsed`) và khôi phục
  khi load. Drawer mobile (≤860px) luôn full 264px.
- **Sidebar scroll:** `.admin-shell` cao đúng 100vh, không scroll chung;
  nav cuộn riêng (`.admin-nav` overflow-y auto), footer/logout dính đáy
  (flex-shrink 0 + hairline trên); content cuộn riêng (`.admin-content-scroll`).
- **Icon nav:** `lucide-react` (size 18, strokeWidth 1.75, `aria-hidden`);
  brand dùng logo ảnh, không tile icon. Không dùng ký tự trang trí
  (◎◈◫…) làm icon. Icon kế thừa màu link qua `currentColor`.
- **Topbar** cao 72px, sticky: nền surface trắng đồng bộ sidebar, breadcrumb trái (muted 13px),
  actions phải. Nút search là icon kính lúp (lucide `Search`, vuông 40px).
  Identity chip (`/me`: avatar 36px + displayName + badge admin) nằm cuối topbar phải.
- **Mobile ≤860px:** sidebar thành drawer trượt trái + backdrop blur; content full width.
- Focus visible: outline 2px primary offset 2px. Icon-button trong table tối thiểu 44px.

## 9. Chart (Dashboard + `/analytics`)

- Lib recharts. Series dùng tone-dark theo ngữ nghĩa: users = primary-dark,
  messages = success-dark, reports/moderation = warning-dark, errors/banned = danger-dark.
  Cấm pastel accent trong chart (không đọc được trên trắng).
- Axis/grid: grid hairline `#e7e5e4`, tick muted 12px mono cho số. Tooltip = panel trắng,
  shadow-soft, radius md. Legend 13px muted, dot tròn 8px.
- Time-range 7d/30d/90d = segmented control (pill group, option active nền ink chữ trắng).
- Sparkline: stroke 2px tone-dark, fill soft 20% opacity.
- Range không có data: EmptyState + orb pastel, không vẽ trục trống.

## 10. Pattern từng route (không tự chế ngoài spec này)

- **`/login`:** card giữa màn hình (tối đa 960px): trái hero ink (`#1c1917`) + orb peach mờ
  + headline Inter 800, phải form 420px. Lỗi 401/403 hiện `.alert` trên nút submit,
  không redirect. Không link quên mật khẩu (admin do platform cấp).
- **`/conversations/:id`:** 2 cột — trái members (avatar 40px + tên + role badge),
  phải 20 tin nhắn read-only dạng row (avatar + tên + body + timestamp mono muted);
  tin đã soft-delete = row mờ + badge muted "Đã gỡ", không hiện nội dung.
- **`/messages` search:** `q` bắt buộc — chưa nhập hiện EmptyState riêng
  ("Nhập từ khóa để tìm", khác EmptyState "không kết quả"). Keyword highlight =
  nền warning-soft + chữ warning-dark. Soft-delete confirm có ô reason bắt buộc.
- **`/moments`:** grid card (thumb 16:9, radius lg) thay vì table; video hiện duration
  mono góc dưới. Story đã takedown = card mờ + badge muted "Đã gỡ".
- **`/music`:** hàng audio (play inline 32px + title + duration mono + badge active/muted).
  Form upload: file input khung dashed hairline-strong, ghi rõ định dạng chấp nhận.
  Xóa mềm hiện toast "Đã ẩn — story cũ vẫn giữ nhạc".
- **`/broadcast`:** form title/body + panel preview mô phỏng (surface-soft, radius lg)
  + confirm 2 bước (preview → type-to-confirm tên "BROADCAST").
- **`/audit-logs`:** table — actor (link tới `/users/:id`), action badge primary,
  target mono, ip mono muted, createdAt relative + absolute tooltip.
  Filter actor/action/ngày (backend chưa có) thì ẨN, không vẽ disabled.
- **Commerce:** product = table có thumb 48px radius sm; inactive = badge muted.
  Order detail read-only: description-list + status map
  (pending→warning, paid→primary, shipped→success, cancelled→danger, refunded→muted).
  Seller picker = select async (chỉ business verified + unbanned), loading skeleton dòng.
- **Màn hình lỗi:** 403-demote = StateBlock + nút "Về dashboard" (không nút login lại);
  404 = EmptyState; 5xx = StateBlock + nút retry primary; 429 = toast warning
  "Thao tác quá nhanh, thử lại sau" + disable nút 10s.
- **Dialog form ngắn** (ban/reject): reason = textarea bắt buộc, durationDays = select
  (1/3/7/30 ngày + vĩnh viễn); nút xác nhận disabled tới khi reason hợp lệ.

## 11. Moderation context (`/reports` detail — không chuyển tab)

Thứ tự block trong drawer 480px: (1) nội dung gốc trong khung surface-soft radius md
(text thuần, media thumb nếu có); (2) target info (avatar + tên + link `/users/:id`);
(3) lịch sử report cũ của target — list thu gọn tối đa 5 + link "xem tất cả"
(deep-link `/reports?target=...`); (4) actions resolve/dismiss (+ reason khi dismiss).
Không mở tab mới ở bất kỳ bước nào.

## 12. Checklist UI trước khi báo done (bổ sung cho AGENTS.md §6)

- [ ] Mọi màu/spacing/radius/shadow qua `var(--...)`; grep không còn hex/px cứng ngoài `index.css`
- [ ] Trang dùng `PageHeader` + panel/table-shell; không tự chế khung mới
- [ ] Trạng thái qua `StatusBadge` đúng mapping màu §3; loading/empty có skeleton/state
- [ ] Hành động phá hủy qua `ConfirmDialog`; feedback qua `Toast`
- [ ] Focus visible rõ (outline primary 2px offset 2px), Dialog focus-trap, table điều hướng bàn phím được
- [ ] Test ở 1440px + 860px + 390px, không tràn ngang (table có `.table-scroll`)
