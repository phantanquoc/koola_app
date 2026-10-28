# Admin-web — Đối chiếu hiện trạng & checklist chuẩn (2026-10-28)

Ký hiệu: ✓ đã có / ◐ có nhưng thiếu / ✗ chưa có.

> Đối chiếu code lần cuối: 2026-10-28 (nhánh `evan/admin-web`).
> Quy tắc nền cho mọi mục mới: xem `DESIGN.md` §5.2 (media ký ở server, audit bắt buộc,
> list phân trang + đủ trạng thái, token xem thay chỉ đọc, TOTP không thêm dependency,
> broadcast chọn đối tượng + ghi lịch sử).

## A. Quản lý người dùng (core — app nào cũng phải có)

1. ✓ Tìm kiếm + lọc + phân trang users, xem detail, ban/unban
2. ✓ Ban có lý do + thời hạn + tự gỡ khi hết hạn — `BanUserDto` lưu `banReason`/`bannedUntil`
   và thu hồi refresh token; UI gửi reason + select 1/3/7/30/vĩnh viễn;
   **cron `AdminUnbanCron`** chạy mỗi 15 phút, khoá Redis per-tick, gỡ tối đa 200 tài khoản
   và ghi audit `actorId=system`. Nút "gỡ cấm ngay" cho từng hồ sơ là thủ công — đúng thiết kế.
3. ✓ Lịch sử vi phạm của 1 user — gộp reports + audit actions; `useViolationHistory` lọc ở
   server theo `targetType`+`targetId` (limit 100, không scan client). Doanh nghiệp tra
   `targetType: 'business'` vì lệnh cấm ghi ở đó.
4. ✓ Thu hồi phiên — `POST /admin/users/:id/revoke-sessions` (thu hồi tất cả) **và**
   `GET /admin/users/:id/sessions` + `DELETE .../sessions/:tokenId` (từng thiết bị, UI
   `UserDevices`, audit `revoke_session`). Chỉ đọc 4 field của refresh token, không trả
   `tokenHash`. Hạn chế đã biết: `current` luôn `false` vì không suy ra được phiên đang
   dùng từ token id; danh sách cap 50 phiên.
5. ✓ Phân vai trò admin + **matrix quyền đã thực thi** (2026-10-28) — `adminRole: super |
   moderator | support`, `AdminRoleGuard` + `@RequireRole`. **`AdminGuard` chặn mọi method
   ghi khi vai trò là `support`** (GET/HEAD/OPTIONS vẫn qua), nên route không gắn
   `@RequireRole` cũng không lọt lưới — đây là chốt chung vì guard phủ toàn bộ controller
   `/admin/*`. Route siết thêm bằng `@RequireRole('super')`: `DELETE /admin/users/:id`,
   `POST .../revoke-sessions`, `POST .../impersonate`, `PATCH /admin/config` (kiểm trong
   controller), `PATCH /admin/businesses/:id` khi body có `commissionRate`.
   Kiểm thật với token `support`: POST broadcast / PATCH config / POST cancel đơn → 403;
   GET users → 200. Chưa có màn hình xem quyền theo vai trò (chỉ là tài liệu) — không phải nợ.
6. ✓ 2FA cho tài khoản admin — TOTP RFC 6238 thuần `crypto` (không dependency),
   `/auth/2fa/setup|enable|disable`, recovery code hash SHA-256 dùng một lần, panel trong
   `UserDetail` (chỉ hiện khi mở hồ sơ của chính mình). Topbar cảnh báo khi chưa bật.
   **Đã bắt buộc được** bằng cờ `ADMIN_MFA_REQUIRED=true`: `AdminGuard` trả 403
   `code: 'mfa_required'` cho admin chưa bật 2FA, trừ `GET /admin/me` (`@MfaExempt()`) để
   còn đường bật; admin-web render wall `MfaRequiredWall` thay cho nội dung và
   `apiClient` không đá 403 này sang `/forbidden`.
   **Vì sao không chặn ở `AuthService.login`**: bật 2FA cần access token — từ chối đăng
   nhập là khoá luôn đường tự bật. Chặn ở tầng quyền admin vẫn đạt mục tiêu (không đọc/ghi
   dữ liệu nào) mà vẫn còn đúng một cửa tự sửa. Kiểm thật: bật cờ → `GET /admin/users`
   403 `mfa_required`, `/admin/me` 200; bật 2FA qua wall → vào lại bình thường.

## B. Kiểm duyệt nội dung (đặc thù chat/moments)

7. ✓ Tìm tin nhắn + xóa mềm, gỡ story, xử lý report
8. ✓ Chi tiết hội thoại + media + **deep-link `focus`** (2026-10-28) — backend trả
   `mediaUrlSigned`/`mediaKeyPreviewSigned` (message) và `mediaUrlSigned`/`thumbnailUrlSigned`
   (story); admin-web chỉ render field `*Signed`, `null` hiện "Không tải được media".
   `reportTargetHref()` trả link thật cho cả 4 loại; mỗi trang đích đọc `?focus=` và tải đúng
   đối tượng qua API riêng: `GET /admin/conversations/:id`, **`GET /admin/messages/:id`**,
   **`GET /admin/stories/:id`** (hai route mới). Đóng drawer/khối focus thì xoá param để
   reload không bật lại.
9. ✓ Hàng đợi kiểm duyệt tập trung — `GET /admin/moderation-queue` gộp báo cáo pending,
   cụm nội dung bị báo ≥3 lần (story/message) và hồ sơ doanh nghiệp chờ duyệt, sort theo
   priority; có trang `/moderation-queue`.
10. ✓ Xem media trước khi gỡ — presign cho message/story + lightbox, `licenseImageUrl`/
    `logoUrl`/`coverUrl` cho hồ sơ, **và media đối tượng bị báo** (2026-10-28):
    `AdminReportService.enrich()` ký `mediaUrl` (message), `mediaKey`+`thumbnailKey`
    (story) trong một batch → `targetMediaUrl`/`targetThumbnailUrl`/`targetMediaType`;
    `ReportDetail` render ảnh/video/lightbox thay vì chỉ tiêu đề text.
11. ◐ Auto-mod assist — hàng đợi đã gom cụm theo số báo cáo + filter
    `hasPendingReport`/`minReports`/`minMembers`/`withMedia`/`sort: reported`. Còn thiếu:
    gắn cờ từ khóa/spam, phát hiện rate-limit bất thường, cảnh báo user bị report nhiều
    lần theo thời gian, và assist tương đương cho messages/stories.
12. ✓ Kháng nghị (appeal) — phía admin: schema `Appeal`, `GET /admin/appeals`,
    `POST /admin/appeals/:id/decide` (chấp nhận mở khoá/bật story/khôi phục tin nhắn; từ
    chối bắt buộc lý do; chống quyết định hai lần + 409), audit `decide_appeal`, trang
    `/appeals`. **Người dùng đã nộp được** (2026-10-28): `POST /appeals` (JWT, không cần
    admin), `userId` lấy từ token nên không nộp hộ được; chặn nộp kháng nghị cho thứ
    không còn hiệu lực (tài khoản không bị cấm / story đang hiển thị / tin nhắn chưa gỡ);
    409 khi đã có đơn đang chờ. **Rate limit đếm SAU validate** — nếu đếm trước, người gõ
    nhầm 3 lần bị khoá một giờ và chính bước "kiểm tra tôi có bị cấm không" lại đốt quota.
    Hàng đợi admin giờ có nguồn dữ liệu thật; UI nộp đơn cho người dùng nằm ở `ChatApp/`
    (phần client, chưa làm).

## C. Dữ liệu & vận hành

13. ✓ Dashboard stats, analytics cơ bản, health check, audit log, broadcast
14. ◐ Audit log có detail `/audit-logs/:id` (payload + IP + target link) và filter
    action/actor/targetType/targetId/from/to/q/search; health vẫn là snapshot (không lưu
    lịch sử uptime/latency); broadcast có chọn đối tượng (`all|personal|business|ids`,
    dedupe, cap 500), lịch sử `broadcast-history` + audit. Còn thiếu: **FCM fallback cho
    **room theo loại tài khoản đã có** (2026-10-28): gateway join
    `account:personal` / `account:business` lúc handshake (token mang `accountType`, mặc
    định personal), `BroadcastService` emit đúng room thay vì phát cho toàn bộ socket —
    trước đây log ghi "gửi cho nhóm" trong khi thực tế mọi socket đều nhận. **FCM cho
    người offline** đã có nhưng chỉ với `audience='ids'` (đó là audience duy nhất có danh
    sách người); `all`/`personal`/`business` đếm theo socket nên không biết ai offline —
    response trả `pushSkipped: 'no_recipient_list'` và UI nói rõ. Còn thiếu: **lịch gửi**
    và chọn nhóm theo loại tài khoản *kèm* danh sách người để push được cả offline.
15. ✓ Quản trị push/FCM — `GET /admin/push-logs` + trang `/ops-logs` (lọc userId, kind,
    khoảng ngày; metric lượt gửi/token/success/failure và tỉ lệ), **và gửi thử**:
    `POST /admin/push-logs/test` (throttle 10/phút, audit `send_test_push`) trả
    `{ tokenCount, successCount, failureCount, skipped }`; dialog trong tab Push cho biết
    rõ "0 token" / "tài khoản tắt thông báo" thay vì báo "đã gửi" chung chung. Khác luồng
    push thường: **không** skip người đang online — mục đích là kiểm kênh FCM.
    **Không làm template**: repo không có hệ template nào (mỗi luồng dựng payload inline),
    bảng template chỉ để chứa vài câu mẫu là bề mặt bảo trì không đổi lại giá trị.
    `skipped` phân biệt `no_user` / `notifications_disabled` / `no_tokens` /
    **`fcm_not_configured`** — trường hợp cuối là lỗi cấu hình deploy (thiếu
    `FIREBASE_PRIVATE_KEY`), báo riêng để admin không đi tìm thiết bị hỏng. Log là
    fire-and-forget nên tỉ lệ delivered là số liệu quan sát, không phải cam kết.
16. ◐ Quản trị OTP/SMS — collection `OtpLog` + `GET /admin/otp-logs` (SĐT đã che
    `091•••78`, lọc success/khoảng ngày, metric tỉ lệ thành công) cho cả SMS và email.
    **Đã chặn SMS pumping** (2026-10-28) ở `PlivoService.sendOtp` — chỗ duy nhất đi ra nhà
    mạng: 3 lượt/giờ/số + 10 lượt/giờ/IP, chuẩn hoá số về dạng nội địa trước khi đếm (nếu
    đếm chuỗi thô thì `+84912…` và `0912…` là hai bucket, đổi định dạng là lách được).
    Trước đây chỉ có limit theo `${userId}:${phone}` — farm 100 tài khoản vẫn gửi được 300
    SMS tới cùng một số. Còn thiếu: cảnh báo khi tỉ lệ gửi tụt.
17. ◐ Cấu hình động — `AppConfig` singleton (`maintenanceMode`, `maintenanceMessage`,
    `forceUpdate.android/ios`, `featureFlags`, `announcement`), `GET/PATCH /admin/config`
    (PATCH chỉ super, audit `update_config`), trang `/config`.
    **Endpoint public đã có** (2026-10-28): `GET /api/config/public`, `@Public()` +
    `@SkipThrottle()` (app đọc lúc khởi động; 429 lúc mở app sẽ hiện màn hình lỗi thay vì
    nội dung bảo trì). Trả đúng 5 field client cần — **không** `updatedBy`. Tách khỏi
    `/admin/config` có chủ đích: mở route admin thành public là biến cấu hình nội bộ
    thành endpoint không cần đăng nhập. PATCH là merge, không xoá được cờ.
    Còn lại: client trong `ChatApp/` chưa gọi route này.
18. ✓ Export dữ liệu — users, businesses, reports và **orders**
    (`GET /admin/commerce/orders/export`, đứng trước `orders/:id`) đều có.
    **Lọc khoảng ngày đã đủ 4 loại** (2026-10-28): thêm `from`/`to` vào
    `ListUsersDto`/`ExportUsersDto`, `ListPendingBusinessesDto`/`ExportBusinessesDto`,
    `AdminListOrdersQueryDto`; dùng chung helper `common/utils/date-range.ts` nên list và
    export không thể lệch. Kiểm thật: không lọc 116 dòng → lọc 16/10 còn 1 dòng → khoảng
    tương lai 0 dòng. UI: hai ô `<input type="date">` trong dialog export của cả **4** trang
    (users, businesses, orders, reports).

    **Bug có sẵn đã sửa trong lúc test**: `UsersPage.handleExport` gửi nguyên `params`
    của list, gồm `page`/`limit`; `ExportUsersDto` không khai hai field đó và
    `ValidationPipe` bật `forbidNonWhitelisted` → **mọi lần xuất CSV người dùng đều
    400**. Nay bỏ `page`/`limit` trước khi gửi (export tự cap 500 ở server).

## D. Thương mại (vì Koola có commerce)

19. ✓ CRUD product/service/store, xem orders + detail, sellers picker
20. ✓ Can thiệp đơn — `POST /admin/commerce/orders/:id/cancel|refund`, `PATCH .../note`
    đã nối route; `AdminRevenueService` + `GET /admin/commerce/revenue`; mọi mutation ghi
    audit `cancel_order`/`refund_order`/`note_order`. Huỷ chỉ PENDING/CONFIRMED; hoàn tiền
    chỉ DELIVERED/CANCELLED, tối đa một lần, `amount ≤ tổng đơn`, không đổi status.
21. ✓ Quản lý hoa hồng — `commissionRate` (0..1) trên `User`, sửa qua
    `PATCH /admin/businesses/:id` (chỉ super, có audit), UI hiện dạng %.
22. ✓ Đối soát doanh thu — `GET /admin/commerce/revenue` trả `totals`/`daily`/`sellers` với
    `gmv`, `orderCount`, `cancelledGmv`, `refundAmount`, `commission`. GMV loại đơn huỷ;
    hoàn tiền cộng riêng; hoa hồng theo tỉ lệ **từng seller**; ngày cắt theo giờ Việt Nam.
    Trang `/revenue` có lọc ngày + seller.

## E. An toàn nền tảng

23. ✓ Rate-limit/quota monitor — `RedisThrottlerStorage` + `generateKey` giữ prefix
    `throttler:` và tracker nên SCAN được top bucket; **trang `/ratelimit`** (2026-10-28)
    gọi `GET /admin/ratelimit/top`, poll 30s, badge theo ngưỡng (≥20 cảnh báo, ≥50 nguy
    hiểm) + banner tổng số bucket vượt ngưỡng. Response tách thêm `route` (phần
    `Class-Handler-throttler` của key) vì cùng một IP có bucket cho nhiều route — thiếu
    nó thì bảng hiện các dòng giống hệt nhau. Tracker đã bị băm thì hiện nguyên key,
    `route: null` thay vì bịa. Còn thiếu: cảnh báo chủ động (email/socket) — hiện là
    màn hình xem.
24. ◐ Nhật ký đăng nhập admin — `lastLoginAt`/`lastLoginIp` ghi ở `AuthService.login` và
    hiện trong `UserDetail` (IP nội bộ bị ẩn); đăng nhập admin ghi audit riêng `admin_login`
    (target `user`, payload `{ip}`) qua model trực tiếp để tránh vòng import
    AuthModule → AdminModule. Còn thiếu: **lịch sử nhiều lần** trong `UserDetail` — hiện chỉ
    lần gần nhất; muốn xem lịch sử thì lọc Audit log theo `admin_login`.
25. ✓ Chế độ "view as user" — token 5 phút chỉ đọc, `JwtAuthGuard` chặn mọi method ghi khi
    `imp`, không xem thay chính mình/admin khác, audit `impersonate_start`, banner đếm
    ngược + khôi phục token admin, nút "Xem thay" trong `UserDetail` (chỉ super, ẩn với
    tài khoản quản trị/đã xoá).

## Việc còn nợ thật (cập nhật 2026-10-28, sau ba vòng cải tiến)

Đã xong vòng 1: matrix quyền support chỉ-đọc (#5), cảnh báo 2FA trên topbar (#6),
deep-link `focus` cho cả 4 loại đối tượng (#8), media đối tượng bị báo (#10), trang
rate-limit (#23), audit per-item cho bulk approve/reject, bỏ presign thừa ở list doanh
nghiệp.

Đã xong vòng 2: **bắt buộc 2FA** bằng cờ `ADMIN_MFA_REQUIRED` (#6), **lọc khoảng ngày**
cho export users/businesses/orders (#18), **chặn SMS pumping** ở `PlivoService` (#16),
**gửi thử push** + audit `send_test_push` (#15).

Đã xong vòng 3: **broadcast đúng room theo loại tài khoản** + FCM cho người offline trong
audience `ids` (#14), **endpoint nộp kháng nghị** `POST /appeals` (#12), **endpoint public
đọc cấu hình** `GET /config/public` (#17).

| # | Việc | Vì sao | Cỡ | Phụ thuộc |
|---|---|---|---|---|
| 1 | **UI nộp kháng nghị trong `ChatApp/`** (#12) | Backend đã có `POST /appeals`; người dùng chưa có chỗ bấm | S | `ChatApp/` — spec: [client-todo.md §1](client-todo.md) |
| 2 | **Client đọc `GET /config/public`** (#17) | Backend đã có; app chưa áp dụng maintenance/forceUpdate | S | `ChatApp/` — spec: [client-todo.md §2](client-todo.md) |
| 3 | **Broadcast: lịch gửi + push cho nhóm theo loại TK** (#14) | `all`/`personal`/`business` đếm theo socket nên không biết ai offline để push; response đã báo `pushSkipped` | M | — |
| 3b | **Client xử lý payload push broadcast** (#14) | Push đã có `data.type = system_broadcast` / `admin_test`; app chưa phân nhánh | XS | `ChatApp/` — spec: [client-todo.md §3](client-todo.md) |
| 4 | **Quyết định cờ `ADMIN_MFA_REQUIRED` trên production** (#6) | Code đã sẵn; bật cờ khi mọi admin đã bật 2FA (đang để `false`) | XS | vận hành |
| 5 | **Auto-mod assist đầy đủ** (#11) | Cần định nghĩa từ khóa/spam — schema mới | L | — |
| 6 | **Lịch sử health uptime/latency** (#14) | Hiện chỉ snapshot; cần collection mới | M | — |

Lưu ý: mục #5 và #6 cần schema mới nên đi qua OpenSpec proposal trước khi code.
Mục #1, #2, #3b nằm trong `ChatApp/` (client mobile **có sẵn trong repo này**) — chi tiết
endpoint, shape response, mã lỗi và cách dùng: xem `docs/client-todo.md`.
Mục #3 là phần còn lại của broadcast: backend đã đúng nhóm và đã push được cho `ids`,
chỉ thiếu danh sách người nhận cho nhóm theo loại tài khoản.

## Đã sửa trong tài liệu này (trước đây ghi sai)

- **#18 từng ghi "thiếu route `GET /admin/commerce/orders/export`"** — sai. Route có thật ở
  `admin-commerce.controller.ts`, đặt đúng trước `orders/:id`, UI `CommerceOrdersPage` đã
  gọi. Nợ thật của #18 chỉ còn phần lọc khoảng ngày.
- **#23 thiếu phần route** — endpoint chỉ trả `{ key, hits, ttlSeconds }`, nên cùng một IP
  có bucket ở nhiều route vẫn hiện thành các dòng giống hệt nhau. Đã thêm `route`
  (`Class-Handler-throttler`); key đã băm thì `route: null`, không đoán.

## Quy tắc đã sửa trong `DESIGN.md` (kèm lý do)

- **Bulk approve/reject (§5.2.2)** — quy tắc cũ ghi "một dòng với `targetId = ids.join(',')`".
  Sai: timeline từng hồ sơ lọc theo `targetId` nên lệnh duyệt hàng loạt biến mất khỏi đó, và
  `openspec/specs/admin-business-verification/spec.md` yêu cầu "each item SHALL write an
  audit entry". Nay: **một entry cho mỗi hồ sơ đã xử lý**, `payload.batchSize` giữ dấu vết lô.
- **List doanh nghiệp** — `queryBusinesses` từng presign `licenseImageUrl` cho từng dòng dù
  UI không render: N HMAC mỗi trang. Đã bỏ; drawer detail tự presign qua `getBusiness`.
- **Thêm §5.2.8** (support chỉ đọc chốt ở `AdminGuard`) và **§5.2.9** (deep-link `focus`
  cần endpoint đọc-một-đối-tượng, không lọc `deleted`/`isActive`).

## Vòng 2 — ghi chú thiết kế (vì sao làm thế này)

- **2FA chặn ở `AdminGuard`, không ở `login()`** — bật 2FA cần access token; từ chối
  đăng nhập là khoá luôn đường tự bật. Đổi lại phải thêm mã lỗi `mfa_required` vào
  `HttpExceptionFilter` (trước đây filter chỉ trả `message`, làm client không phân biệt
  được với 403 "hạ quyền" và đá sang `/forbidden`).
- **Cờ đọc thẳng `process.env`** trong `AdminGuard` thay vì qua `ConfigService`: guard
  được khai ở 4 module, thêm provider là thêm 4 chỗ sửa + 3 spec phải mock.
- **SMS quota đặt trong `PlivoService`**, không ở caller — đó là chỗ duy nhất đi ra nhà
  mạng, nên caller thêm sau này cũng được bảo vệ mà không phải nhớ gì.
- **`applyCreatedAtRange` merge** vào `createdAt` có sẵn (nhánh SLA) thay vì gán đè —
  chọn SLA + khoảng ngày là giao của hai điều kiện.
- **Gửi thử push không skip `isOnline`** — khác luồng push thường vì mục đích là kiểm
  kênh FCM; skip thì admin không bao giờ thấy kết quả.
- **Popup audit dùng key `devices`/`delivered`/`failed`** thay vì `tokenCount…`: bộ lọc
  redact bắt theo tên key chứa "token" nên `tokenCount` bị thay bằng `[REDACTED]`.

## Vòng 3 — ghi chú thiết kế (vì sao làm thế này)

- **Broadcast room (`account:<loại>`) đặt ở gateway, không ở service.** Gateway là nơi
  duy nhất biết `accountType` của socket (từ token handshake). Service chỉ cần biết tên
  room; nếu service tự lọc theo DB thì mỗi lần gửi là một query toàn bộ user.
- **FCM broadcast chỉ có nghĩa với `audience='ids'`.** Các audience khác đếm theo socket
  nên không biết ai đang offline — bịa một danh sách để push là đoán. Response trả
  `pushSkipped: 'no_recipient_list'` để UI nói thật thay vì im lặng.
- **`POST /appeals` không dùng AdminGuard** và `userId` lấy từ token: người bị xử lý cần
  tự bảo vệ mình, và đây là nguồn dữ liệu duy nhất cho hàng đợi admin. Đặt trong
  AdminModule (đã có `AppealService`) thay vì UsersModule để tránh vòng module.
- **Rate limit kháng nghị đếm SAU validate.** Đếm trước thì 3 lần gõ nhầm là khoá một
  giờ, và chính bước kiểm tra "tôi có đang bị cấm không" lại tự đốt quota của người gửi.
- **`GET /config/public` tách khỏi `/admin/config`.** Mở route admin thành public là biến
  cấu hình nội bộ (kèm `updatedBy`) thành endpoint không cần đăng nhập. Route public chỉ
  trả 5 field client dùng, và `@SkipThrottle()` vì app đọc lúc khởi động.

## Vòng 4 — hai lỗ ban phát hiện khi viết spec client

Trong lúc viết `client-todo.md` thì phát hiện phần ban có hai lỗ thật, đã sửa:

1. **Ban trễ tới 1 giờ.** `AuthService.login` chặn user bị cấm, nhưng access token cấp
   trước đó vẫn hợp lệ tới hết hạn (1h) — người vừa bị cấm vẫn chat, vẫn đọc hội thoại
   (đo thật: `GET /users/me` → 200 khi đang bị cấm). Nay `JwtStrategy` trả `isBanned`
   và `JwtAuthGuard` chặn mọi route, đọc lại DB mỗi request nên có hiệu lực ngay.
2. **Kháng nghị không dùng được với người bị cấm.** Login trả 403 nên họ không có token
   để gọi `POST /appeals`; tính năng vô dụng đúng với người cần nhất. Nay 403
   `account_banned` mang theo **`appealToken`** — JWT 10 phút, claim `appeal`, chỉ đi
   được vào route `@AllowBanned()`, không phải phiên đăng nhập.

Kèm theo: `HttpExceptionFilter` trước đó chỉ forward `message`, **nuốt mọi field phụ**
(`code`, `appealToken`, `banReason`) — nên cả hai cơ chế trên sẽ vô hình với client.
Nay filter forward toàn bộ payload trừ `statusCode`/`message`/`error`.
