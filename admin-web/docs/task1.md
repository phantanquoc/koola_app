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
6. ◐ 2FA cho tài khoản admin — TOTP RFC 6238 thuần `crypto` (không dependency),
   `/auth/2fa/setup|enable|disable`, recovery code hash SHA-256 dùng một lần, panel trong
   `UserDetail` (chỉ hiện khi mở hồ sơ của chính mình). **Topbar đã cảnh báo** khi admin
   chưa bật (`GET /admin/me` trả `twoFactorEnabled` boolean, badge "Chưa bật 2FA" link tới
   hồ sơ cá nhân) — 2026-10-28. Còn thiếu: **chưa bắt buộc** bật 2FA trước khi dùng admin.

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
12. ◐ Kháng nghị (appeal) — **phía admin đủ**: schema `Appeal`, `GET /admin/appeals`,
    `POST /admin/appeals/:id/decide` (chấp nhận mở khoá/bật story/khôi phục tin nhắn; từ
    chối bắt buộc lý do; chống quyết định hai lần bằng update có điều kiện + 409), audit
    `decide_appeal`, trang `/appeals`. **Còn thiếu: endpoint cho người dùng nộp kháng nghị**
    — `grep appeal` trong `ChatApp/src` không có kết quả, nên hàng đợi chỉ có dữ liệu do
    seed/script tạo. Việc này cần sửa phía mobile.

## C. Dữ liệu & vận hành

13. ✓ Dashboard stats, analytics cơ bản, health check, audit log, broadcast
14. ◐ Audit log có detail `/audit-logs/:id` (payload + IP + target link) và filter
    action/actor/targetType/targetId/from/to/q/search; health vẫn là snapshot (không lưu
    lịch sử uptime/latency); broadcast có chọn đối tượng (`all|personal|business|ids`,
    dedupe, cap 500), lịch sử `broadcast-history` + audit. Còn thiếu: **FCM fallback cho
    người offline**, lịch gửi, và room theo loại tài khoản (`personal`/`business` hiện
    fanout toàn bộ — `broadcast.service.ts` ghi rõ trong comment; log ghi audience để đối
    soát khi gửi lại đúng nhóm).
15. ◐ Quản trị push/FCM — `GET /admin/push-logs` + trang `/ops-logs` (lọc userId, kind,
    khoảng ngày; metric lượt gửi/token/success/failure và tỉ lệ). Còn thiếu: **gửi thử theo
    userId** và xem template. Log là fire-and-forget nên tỉ lệ delivered là số liệu quan
    sát, không phải cam kết — đúng thiết kế.
16. ◐ Quản trị OTP/SMS — collection `OtpLog` + `GET /admin/otp-logs` (SĐT đã che
    `091•••78`, lọc success/khoảng ngày, metric tỉ lệ thành công) cho cả SMS và email.
    Còn thiếu: **chặn số spam/rác** (chưa đếm theo SĐT để tự chặn) và cảnh báo khi tỉ lệ
    gửi tụt.
17. ◐ Cấu hình động — `AppConfig` singleton (`maintenanceMode`, `maintenanceMessage`,
    `forceUpdate.android/ios`, `featureFlags`, `announcement`), `GET/PATCH /admin/config`
    (PATCH chỉ super, audit `update_config`), trang `/config`. Còn thiếu: **endpoint public
    cho client đọc** (hiện chỉ `/admin/config`, mobile chưa dùng) — cần route `@Public()`
    riêng, không mở route admin. PATCH là merge, không xoá được cờ.
18. ◐ Export dữ liệu — users, businesses, reports (`/admin/reports/export`, có from/to) và
    **orders** (`GET /admin/commerce/orders/export`, đứng trước `orders/:id`, UI
    `CommerceOrdersPage` đã gọi) đều có. Còn thiếu: **lọc khoảng ngày cho users/businesses/
    orders export** (reports đã có `from`/`to`); `ExportOrdersDto` chưa có `createdFrom/
    createdTo`.

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

## Việc còn nợ thật (cập nhật 2026-10-28, sau vòng cải tiến)

Đã xong trong vòng này: matrix quyền support chỉ-đọc (#5), cảnh báo 2FA trên topbar (#6),
deep-link `focus` cho cả 4 loại đối tượng (#8), media đối tượng bị báo (#10), trang
rate-limit (#23), audit per-item cho bulk approve/reject, bỏ presign thừa ở list doanh
nghiệp.

| # | Việc | Vì sao | Cỡ | Phụ thuộc |
|---|---|---|---|---|
| 1 | **Endpoint người dùng nộp kháng nghị** (#12) | Hàng đợi appeal không có nguồn dữ liệu thật | S | mobile |
| 2 | **Bắt buộc 2FA cho admin** (#6) | Đã cảnh báo nhưng chưa chặn; chỉ cần lộ mật khẩu là vào hết | S | — |
| 3 | **Broadcast FCM fallback + room theo loại tài khoản** (#14) | Người offline không nhận gì; personal/business đang fanout toàn bộ | M | — |
| 4 | **Lọc khoảng ngày cho export users/businesses/orders** (#18) | Đối soát theo kỳ hiện phải xuất cả file rồi lọc tay | S | — |
| 5 | **OTP: chặn số spam/rác** (#16) | Chưa đếm theo SĐT — bị lạm dụng là tốn tiền SMS | S | — |
| 6 | **Gửi thử push theo userId + xem template** (#15) | Không có cách kiểm FCM sau khi đổi cấu hình | S | — |
| 7 | **Endpoint public đọc cấu hình** (#17) | Mobile chưa tiêu thụ được maintenance/forceUpdate | S | mobile |
| 8 | **Auto-mod assist đầy đủ** (#11) | Cần định nghĩa từ khóa/spam — schema mới | L | — |
| 9 | **Lịch sử health uptime/latency** (#14) | Hiện chỉ snapshot; cần collection mới | M | — |

Lưu ý: mục #8 và #9 cần schema mới nên đi qua OpenSpec proposal trước khi code.
Mục #1 và #7 phụ thuộc mobile.

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
