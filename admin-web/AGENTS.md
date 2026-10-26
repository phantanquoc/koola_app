# admin-web — Agent Instructions

Admin console (operations) cho APP_KOOLA. REST-first SPA — **không dùng socket.io-client**.
Mọi hiệu ứng realtime (broadcast, message_deleted, story_deleted) backend tự phát qua
ChatGateway đã inject trong controller; admin-web chỉ gọi REST + refetch/polling.

> Backend admin API: `chat-backend/src/admin/` + `chat-backend/src/commerce/admin-commerce.controller.ts`
> Auth: `@UseGuards(JwtAuthGuard, AdminGuard)` ở cấp controller — đọc `isPlatformAdmin`
> fresh từ DB mỗi request (demote có hiệu lực ngay, không chờ token hết hạn).
> Visual: mọi việc liên quan UI đọc `admin-web/DESIGN.md` trước khi code.

---

## 1. Stack (quyết định từ research — KHÔNG đổi)

- Giữ: **Vite 8 + React 19 + TypeScript + react-router-dom v7** + hand-rolled CSS kit
  (`TableShell`, `Pagination`, `Dialog`, `Toast`, `MetricCard`, `StateBlock`, `EmptyState`, `BulkBar`).
- Thêm: **TanStack Query** (cache/dedup/retry, thay useEffect+axios thủ công),
  **zod** (validate form ở boundary), **recharts** (dashboard/analytics),
  **react-i18next** (label Vi/En đang lẫn lộn).
- Không thêm: socket.io-client, TanStack Router (không migrate), shadcn/component library mới.

## 2. Quy tắc bắt buộc (vi phạm = làm lại)

1. Mọi API call dùng prefix `/api` (VD `/api/admin/stats`). Không hardcode host —
   đọc `VITE_API_URL` từ env. Fail fast nếu env thiếu.
2. Origin của admin-web phải có trong `FRONTEND_URL` của backend (CORS).
   Không bao giờ thêm `@Public()` vào route `/admin/*`.
3. Silent refresh access-token và retry request khi 401 trước khi logout.
   Không decode JWT phía client để ra quyết định phân quyền —
   nguồn đúng là `GET /api/admin/me`.
4. Map lỗi theo status, không gom chung:
   `400` hiện lỗi field · `401` re-auth · `403` màn hình "bị hạ quyền" (không redirect vòng lặp)
   · `404` empty-state · `5xx` nút retry. Log response ra console khi dev.
5. Không commit secret, token, file `.env`.
6. Validate mọi input form bằng zod ở boundary: `ids[]`, `reason`, `durationDays`,
   `BroadcastDto {title, body}`.
7. Music-track CRUD **chỉ** dùng `/admin/music-tracks`.
   Cấm gọi legacy `/moments/music-tracks*` (không có AdminGuard fresh-read, không audit).
8. Không cache presigned GET URL trong grid/table. Xin URL mới mỗi lần mở preview
   media/license, xử lý `403 Forbidden` (hết hạn/không quyền).
9. Tái dùng kit có sẵn (`TableShell`, `Pagination`, `StateBlock`, `EmptyState`, `Dialog`,
   `Toast`). Không thêm lib component mới.
10. Mỗi logic phi tầm thường (hook, guard, mutation) có 1 vitest; stub page cũng cần
    ít nhất 1 render test.
11. Sửa bug `config.ts`: đừng viết `import.meta.env.X as string ?? fallback`
    (`as` ưu tiên hơn `??` nên fallback chết) — đọc env trước, ép kiểu sau, fallback
    qua hằng số tường minh.
12. Mọi việc UI đọc `admin-web/DESIGN.md` trước khi code: token qua `var(--...)`
    (cấm hex/px cứng), dùng kit `src/components/` (cấm chế component mới khi kit có),
    trạng thái qua `StatusBadge` đúng mapping màu, xong check checklist UI trong DESIGN.md.

## 3. Kiến trúc trang (Information Architecture)

| Route | Nguồn API |
|---|---|
| `/login` | `POST /api/auth/login` → `GET /api/admin/me` (platform-admin only, no self-register) |
| `/` Dashboard | `GET /api/admin/stats` + sparklines |
| `/analytics` | `GET /api/admin/analytics?range=7d\|30d\|90d` (recharts) |
| `/businesses` | **trang mẫu** — `GET /api/admin/businesses/pending` với tabs `all/pending/verified/rejected/expiring/archived`, search server-side (tên/email/SĐT/MST/ID), lọc category/province/relationship/banned/suspended/sla, sort whitelist, export CSV (cap 500). Actions: duyệt/từ chối đơn + bulk (per-item result), tạm ngưng bán, ban, xoá mềm, khôi phục, nhận hồ sơ (`bulk-assign`), PATCH inline edit |
| `/users` | `GET /api/admin/users` (search theo displayName/email/phone + `accountType`), detail, `POST .../ban {reason?, durationDays? 1-365}` / `unban` |
| `/conversations` + detail | list (search tên + member, filter type/hasPendingReport/minReports/hasMedia/activeAfter/minMembers/maxMembers, sort recent/reported/created), detail = conversation + members + recentMessages (limit 1-50, mặc định 20, `before` để load thêm, `hasMore`, `reportedMessageCounts`) |
| `/messages` | `GET /api/admin/messages/search` (`q` bắt buộc, lọc `conversationId`) + soft-delete có confirm |
| `/moments` | `GET /api/admin/stories` (lọc authorId) + takedown |
| `/music` | CRUD `/api/admin/music-tracks` (xóa mềm giữ toàn vẹn story) |
| `/reports` | `GET /api/admin/reports` (status/targetType) + resolve/dismiss |
| `/products`, `/orders`, `/services`, `/stores` | commerce admin (products gồm cả inactive; orders read-only + detail; seller picker = business verified + unbanned) |
| `/health` | `GET /api/admin/health` (mongo/redis/coturn/minio), **poll 30s**, không socket |
| `/broadcast` | `POST /api/admin/broadcast {title, body}` + ghi chú preview (emit toàn server, gõ sai không undo) |
| `/audit-logs` | bảng phân trang — `GET /audit-logs` có `page/limit` + `action`/`actor` (tên hoặc email)/`targetType`/`targetId`/`search` (khớp một phần, bắt được dòng bulk)/`from`/`to`; actor + target name resolve server-side |

## 4. Phase triển khai

- **P1 Foundation fix** — sửa `config.ts` + fail-fast env; apiClient đã có
  interceptor 401-refresh-retry single-flight (`POST /api/auth/refresh`) + màn 403-demote
  (KHÔNG redirect /login vòng lặp — xong, verify 2026-10-20); còn lại: root Error Boundary +
  scaffold i18n Vi/En; giữ router v7 + CSS kit; gate eslint+tsc.
- **P2 Moderation core** — lấp stub rủi ro cao nhất: conversations (+detail —
  `GET /admin/conversations/:id` đã có cả backend lẫn UI workbench; cần thêm
  route `users/:id`, `stores` vào App.tsx nếu chưa có),
  messages (search + soft-delete), reports (resolve/dismiss + link tới target), audit-logs.
- **P3 Identity & business** — migrate Businesses/Users sang Query + kit (giữ BulkBar);
  modal preview license (URL mới mỗi lần mở); moments takedown + music CRUD đúng
  `/admin/*`; chip identity `/me` ở header.
- **P4 Commerce** — Products/Orders sang Query + filter (status/seller/buyer);
  services + stores CRUD theo mẫu product; seller picker từ `/sellers`.
- **P5 Ops & insight** — Dashboard + Analytics (recharts, time-range);
  health polling 30s; broadcast form + preview; full Vi/En pass;
  Playwright smoke: login → approve-business → ban-user.

## 5. Danh mục API backend (tham chiếu nhanh)

`admin.controller.ts`: `GET /me /stats /audit-logs /businesses/pending`, `POST /businesses/bulk-approve|bulk-reject|:id/approve|:id/reject`, `GET /users /users/:id`, `POST /users/:id/ban|unban`.
`admin-moderation.controller.ts`: `GET /conversations /conversations/:id /messages/search /stories /reports /music-tracks /audience-lists`, `POST /messages/:id/soft-delete /stories/:id/takedown /reports/:id/resolve|dismiss`, full CRUD `/music-tracks`.
`admin-ops.controller.ts`: `GET /analytics /health`, `POST /broadcast`.
`commerce/admin-commerce.controller.ts`: `GET /commerce/orders /orders/:id /products /sellers /stores /services`, `POST/PATCH/DELETE /products/:id /stores/:id /services/:id` (CRUD đầy đủ — UI orders hiện read-only là quyết định frontend, không phải thiếu backend).
Throttle: global 60 req/phút (`short`) + 600 req/phút (`long`); mutation admin
(ban/approve/broadcast/soft-delete/...) siết 30/200. UI 429: disable nút 10s + pause polling.

DTO backend nằm ở `chat-backend/src/admin/dto/` (+ commerce DTO cùng module):
`BulkBusinessDto {ids[]}`, `BanUserDto {reason, durationDays}`, `RejectBusinessDto {rejectionReason}`,
`BroadcastDto {title, body}` (inline trong admin-ops.controller.ts), query DTO
(`page/limit/search/type/range`). Type frontend mirror đúng tên field — drift là 400 âm thầm
(ValidationPipe `forbidNonWhitelisted`).

Env contract: admin-web `VITE_API_URL` PHẢI gồm prefix `/api`
(VD `http://localhost:3000/api`); backend `FRONTEND_URL` (comma-separated) phải chứa
origin admin-web mọi môi trường (dev `http://localhost:5173`, prod domain thật) —
thiếu là CORS gãy toàn bộ. Vite chỉ đọc env lúc khởi động → đổi env phải restart dev server.

## 6. Quality checklist (check trước khi báo done)

- [ ] **Type-safety:** `tsc` sạch; type mirror đúng DTO backend (`BulkBusinessDto`, `BanUserDto`, ...) — drift là 400 âm thầm.
- [ ] **Error handling:** message theo từng status (400/401/403/404/5xx), không `alert()` thô, path 403-demote đã test.
- [ ] **Loading/empty:** mọi table dùng `StateBlock`/`EmptyState`; không còn stub trống.
- [ ] **a11y:** input có label, Dialog focus-trap, table điều khiển được bằng bàn phím.
- [ ] **Perf:** Query cache + pagination mọi list; không fetch presigned URL theo từng dòng grid (hết hạn 1h, vừa chậm vừa phí).
- [ ] **Security:** không secret trong repo; Bearer trong memory; CORS origin đã set; không gọi route legacy `/moments/*`.
- [ ] **Không-socket đúng cách:** health poll 30s; refetch sau mutation (admin không có socket namespace).
- [ ] **Testing:** vitest cho mutation/hook + Playwright smoke 3 flow chính (login, approve-business, ban-user).
- [ ] **URL-as-state (deep link):** mọi filter/search/pagination/sort nằm trong URL search params
  (`?status=pending&page=2&q=...`); reload giữ nguyên view; detail route (`/users/:id`,
  `/conversations/:id`) mở trực tiếp được, copy link chia sẻ cho moderator khác được.
- [ ] **Destructive-action guard:** ban / takedown / soft-delete / bulk-reject / broadcast đều qua
  Dialog confirm nêu rõ hậu quả + ô lý do bắt buộc khi backend yêu cầu (`reason`,
  `rejectionReason`); broadcast confirm 2 bước.
- [ ] **Untrusted content:** nội dung của user (message search, report reason, displayName,
  tên business) render as text — cấm `dangerouslySetInnerHTML`; avatar/URL validate scheme
  http(s) trước khi render.
- [ ] **429 rate-limit:** global 60 req/phút (`short`) + 600 req/phút (`long`),
  mutation admin siết 30/200 — UI hiện "thao tác quá nhanh, thử lại sau", disable nút 10s + pause polling, không retry dồn dập.
- [ ] **i18n discipline:** không hardcode string hiển thị; mọi label qua react-i18next (vi/en);
  ngày/giờ/số format theo locale, thống nhất timezone hiển thị.
- [ ] **Form UX:** validate inline từng field bằng zod, lỗi hiện cạnh field; disable submit
  khi invalid/loading; giữ lại input khi submit lỗi (không xóa form của operator).
- [ ] **Auth continuity:** sau login redirect về đúng trang đang làm (kèm query params);
  refresh token giữ nguyên state; màn hình 403-demote giải thích, không đá về login vòng lặp.
- [ ] **PII masking:** số điện thoại và thông tin nhạy cảm của user che mặc định,
  click-to-reveal (và chỉ reveal khi thật sự cần cho nghiệp vụ).
- [ ] **Environment banner:** banner phân biệt rõ DEV / PROD trên mọi màn hình —
  thao tác nhầm trên prod (ban, broadcast) là sự cố nghiêm trọng nhất của admin tool.
- [ ] **Bulk preview:** bulk-approve/bulk-reject hiện tổng số bản ghi đã chọn + tóm tắt
  trước confirm; không cho bulk mù.
- [ ] **Moderation context:** khi xử lý report, moderator xem được ngữ cảnh trong cùng màn hình —
  link tới user bị report, lịch sử report cũ của target, nội dung gốc (không chuyển tab mò).
- [ ] **Queue aging (SLA):** cột "tuổi" của report/pending-business (tính từ createdAt),
  sort ưu tiên item cũ nhất; item quá hạn nổi bật visually.
- [ ] **Keyboard-first moderation:** phím tắt duyệt queue (j/k di chuyển, phím action),
  hiển thị gợi ý phím — moderator xử lý hàng trăm ticket/ngày, chuột-only là chậm.
- [ ] **Type-to-confirm:** hành động diện rộng/không undo (broadcast, bulk > N bản ghi)
  yêu cầu gõ xác nhận, không chỉ bấm nút.
- [ ] **Permission helper tập trung:** mọi nút hành động đi qua một helper/check duy nhất
  (hiện tại chỉ có `isPlatformAdmin`, nhưng code phải sẵn sàng khi backend thêm role —
  không rải `if (isAdmin)` khắp nơi).
- [ ] **Idle session:** cảnh báo trước khi token hết hạn do không thao tác; hết hạn thì giữ
  lại trang đang làm để login xong quay lại, không mất việc.
- [ ] **Error tracking:** admin-web production có báo lỗi tập trung (VD Sentry) —
  lỗi của tool nội bộ mà không ai biết thì moderator im lặng chịu đựng.
- [ ] **Export có giới hạn (cần backend):** xuất CSV audit-log/users phải có cap số dòng +
  lọc theo khoảng ngày; export lớn chuyển async — cấm nút "export all"同步 kéo sập DB.
- [ ] **Audit-log filter mở rộng:** đã có action/actor/target/ngày + `search` khớp một phần
  (bắt được dòng bulk). Còn thiếu: dedupe/aggregation (một người duyệt 200 hồ sơ = 200 dòng
  bulk hay 200 dòng đơn?) và export audit log có cap — chưa nên thêm export khi chưa chốt
  chính sách lưu trữ.

> Ghi chú PM — cố tình LOẠI khỏi checklist hiện tại: impersonation (đăng nhập hộ user —
> backend chưa có, rủi ro tuân thủ cao, chưa có nhu cầu support); MFA/SSO bắt buộc
> (cần backend + hạ tầng, ghi vào backlog bảo mật thay vì checklist code);
> 2-person approval cho bulk (quy trình tổ chức, team 2 người chưa cần).

## 7. Rủi ro đã biết

- `POST /api/auth/refresh` (auth.controller.ts:115-123) + apiClient single-flight
  401-refresh-retry + màn 403-demote đã xong (verify 2026-10-20) — không redirect /login vòng lặp.
- `POST /admin/broadcast` emit toàn server, không undo — form cần confirm 2 bước.
- Chưa có endpoint REST cho live stats (online users, calls đang diễn ra) — Redis hiện chỉ là pub/sub adapter; dashboard live counter cần endpoint mới phía backend.
- Production: quên thêm origin admin-web vào `FRONTEND_URL` là gãy toàn bộ (chỉ lộ ở prod, dev không thấy).
