# Admin-web — Đối chiếu hiện trạng & checklist chuẩn (2026-10-27)

Ký hiệu: ✓ đã có / ◐ có nhưng thiếu / ✗ chưa có.

> Đối chiếu code lần cuối: 2026-10-27 (nhánh `evan/admin-web`).
> Quy tắc nền cho mọi mục mới: xem `DESIGN.md` §5.2 (media ký ở server, audit bắt buộc,
> list phân trang + đủ trạng thái, token xem thay chỉ đọc, TOTP không thêm dependency,
> broadcast chọn đối tượng + ghi lịch sử).

## A. Quản lý người dùng (core — app nào cũng phải có)

1. ✓ Tìm kiếm + lọc + phân trang users, xem detail, ban/unban
2. ✓ Ban có lý do + thời hạn + tự gỡ khi hết hạn — `BanUserDto` lưu `banReason`/`bannedUntil`
   và thu hồi refresh token; UI gửi reason + select 1/3/7/30/vĩnh viễn (2026-10-20);
   **cron `AdminUnbanCron`** chạy mỗi 15 phút, khoá Redis per-tick, gỡ tối đa 200 tài khoản
   và ghi audit `actorId=system` (2026-10-27). Còn thiếu: nút "gỡ cấm ngay" cho từng hồ sơ
   vẫn là thủ công — đúng thiết kế, không phải nợ.
3. ✓ Lịch sử vi phạm của 1 user — gộp reports + audit actions; `useViolationHistory` lọc ở
   server theo `targetType`+`targetId` (limit 100, không scan client). Doanh nghiệp tra
   `targetType: 'business'` vì lệnh cấm ghi ở đó.
4. ✓ Thu hồi phiên — `POST /admin/users/:id/revoke-sessions` (thu hồi tất cả) **và**
   `GET /admin/users/:id/sessions` + `DELETE .../sessions/:tokenId` (từng thiết bị, UI
   `UserDevices`, audit `revoke_session`). Chỉ đọc 4 field của refresh token, không trả
   `tokenHash`. Hạn chế: `current` luôn `false` vì không suy ra được phiên đang dùng từ
   token id; danh sách cap 50 phiên.
5. ◐ Phân vai trò admin — **đã có mô hình + enforce**: `adminRole: super | moderator |
   support`, `AdminRoleGuard` + `@RequireRole`, `RoleBadge`, đổi vai trò chỉ super
   (`PATCH /admin/users/:id`). Route super-only đã gắn: `DELETE /admin/users/:id`,
   `POST .../revoke-sessions`, `POST .../impersonate`, `PATCH /admin/config`,
   `PATCH /admin/businesses/:id` khi body có `commissionRate`. **Còn thiếu: matrix quyền
   chi tiết** — route không gắn `@RequireRole` thì moderator/support đều qua, nên
   "support chỉ-đọc" chưa được thực thi; chưa có màn hình xem quyền theo vai trò.
6. ◐ 2FA cho tài khoản admin — **đã có** TOTP RFC 6238 thuần `crypto` (không dependency),
   `/auth/2fa/setup|enable|disable`, recovery code hash SHA-256 dùng một lần, panel trong
   `UserDetail` (chỉ hiện khi mở hồ sơ của chính mình). Còn thiếu: **chưa bắt buộc** admin
   bật 2FA, và chưa có cảnh báo trên topbar khi admin chưa bật.

## B. Kiểm duyệt nội dung (đặc thù chat/moments)

7. ✓ Tìm tin nhắn + xóa mềm, gỡ story, xử lý report
8. ◐ Chi tiết hội thoại + media — **bug ảnh vỡ đã sửa**: backend trả thêm `mediaUrlSigned`
   /`mediaKeyPreviewSigned` (message) và `mediaUrlSigned`/`thumbnailUrlSigned` (story);
   admin-web chỉ render field `*Signed`, `null` hiện "Không tải được media". **Còn thiếu:
   deep-link `focus`** — `ConversationsPage`/`MessageSearchPage` chưa đọc param nên
   `reportTargetHref()` cố ý trả `null` cho message/conversation/story; bật lại khi hai
   trang đọc `focus`.
9. ✓ Hàng đợi kiểm duyệt tập trung — `GET /admin/moderation-queue` gộp báo cáo pending,
   cụm nội dung bị báo ≥3 lần (story/message) và hồ sơ doanh nghiệp chờ duyệt, sort theo
   priority; có trang `/moderation-queue`.
10. ◐ Xem media trước khi gỡ — **đã có** presign cho message/story + lightbox, và
    `licenseImageUrl`/`logoUrl`/`coverUrl` cho hồ sơ. Còn thiếu: `ReportDetail` chỉ hiện
    tiêu đề/nội dung text, **chưa có media của đối tượng bị báo** (cần presign ở server cho
    report target rồi mới có lightbox).
11. ◐ Auto-mod assist — **một phần**: hàng đợi đã gom cụm theo số báo cáo + filter
    `hasPendingReport`/`minReports`/`minMembers`/`withMedia`/`sort: reported`. Còn thiếu:
    gắn cờ từ khóa/spam, phát hiện rate-limit bất thường, cảnh báo user bị report nhiều
    lần theo thời gian, và assist tương đương cho messages/stories.
12. ◐ Kháng nghị (appeal) — **phía admin đủ**: schema `Appeal`, `GET /admin/appeals`,
    `POST /admin/appeals/:id/decide` (chấp nhận mở khoá/bật story/khôi phục tin nhắn; từ
    chối bắt buộc lý do; chống quyết định hai lần bằng update có điều kiện + 409), audit
    `decide_appeal`, trang `/appeals`. **Còn thiếu: endpoint cho người dùng nộp kháng nghị**
    — hiện không có route nào tạo `Appeal`, nên hàng đợi chỉ có dữ liệu do seed/script tạo.

## C. Dữ liệu & vận hành

13. ✓ Dashboard stats, analytics cơ bản, health check, audit log, broadcast
14. ◐ Audit log **đã có** detail `/audit-logs/:id` (payload + IP + target link) và filter
    action/actor/targetType/targetId/from/to/q/search; **health** vẫn chỉ là snapshot
    (không lưu lịch sử uptime/latency); **broadcast đã có** chọn đối tượng
    (`all|personal|business|ids`, dedupe, cap 500), lịch sử `broadcast-history` + audit,
    nhưng **vẫn chưa có FCM fallback cho người offline**, chưa có lịch gửi, và
    `personal`/`business` hiện fanout toàn bộ (chưa có room theo loại tài khoản) — log ghi
    audience để đối soát khi gửi lại đúng nhóm.
15. ◐ Quản trị push/FCM — **đã có** `GET /admin/push-logs` + trang `/ops-logs` (lọc userId,
    kind, khoảng ngày; metric lượt gửi/token/success/failure và tỉ lệ). Còn thiếu:
    **gửi thử theo userId** và xem template; log là fire-and-forget (ghi hỏng không chặn
    luồng gửi), nên tỉ lệ delivered là số liệu quan sát, không phải cam kết.
16. ◐ Quản trị OTP/SMS — **đã có** collection `OtpLog` + `GET /admin/otp-logs` (SĐT đã che
    `091•••78`, lọc success/khoảng ngày, metric tỉ lệ thành công) cho cả SMS và email.
    Còn thiếu: **chặn số spam/ráác** (chưa có đếm theo SĐT để tự chặn) và chưa có màn
    hình cảnh báo khi tỉ lệ gửi tụt.
17. ◐ Cấu hình động — **đã có** `AppConfig` singleton (`maintenanceMode`,
    `maintenanceMessage`, `forceUpdate.android/ios`, `featureFlags`, `announcement`),
    `GET/PATCH /admin/config` (PATCH chỉ super, ghi audit `update_config`), trang `/config`.
    Còn thiếu: **chưa có endpoint public cho client đọc** và mobile chưa tiêu thụ cấu hình
    này — hiện chỉ admin tự xem. PATCH là merge (không xoá được cờ).
18. ◐ Export dữ liệu — users, businesses, **reports** (`/admin/reports/export`, có
    from/to) và **orders** (service `exportAdmin` + UI) đều đã có. **Còn thiếu: route
    `GET /admin/commerce/orders/export`** — service và nút trên UI đã có nhưng controller
    chưa đăng ký route nên gọi sẽ 404. Users/businesses export chưa có lọc khoảng ngày;
    orders export cũng chưa có `createdFrom/createdTo`.

## D. Thương mại (vì Koola có commerce)

19. ✓ CRUD product/service/store, xem orders + detail, sellers picker
20. ✓ Can thiệp đơn — `POST /admin/commerce/orders/:id/cancel|refund`,
    `PATCH .../note` đã nối route; `AdminRevenueService` + `GET /admin/commerce/revenue`
    đã có; mọi mutation ghi audit `cancel_order`/`refund_order`/`note_order`. Huỷ chỉ
    PENDING/CONFIRMED; hoàn tiền chỉ DELIVERED/CANCELLED, tối đa một lần, `amount ≤ tổng
    đơn`, và **không đổi status** (mobile chỉ có 5 trạng thái).
21. ✓ Quản lý hoa hồng — `commissionRate` (0..1) trên `User` (tài khoản doanh nghiệp),
    sửa qua `PATCH /admin/businesses/:id` (chỉ super, có audit), UI hiện dạng %.
22. ✓ Đối soát doanh thu — `GET /admin/commerce/revenue` trả `totals`/`daily`/`sellers`
    với `gmv`, `orderCount`, `cancelledGmv`, `refundAmount`, `commission`. GMV loại đơn
    huỷ; hoàn tiền cộng riêng, không trừ GMV; hoa hồng tính theo tỉ lệ **từng seller**,
    ngày cắt theo giờ Việt Nam. Trang `/revenue` có lọc ngày + seller.

## E. An toàn nền tảng

23. ◐ Rate-limit/quota monitor — hạ tầng đã sẵn: `RedisThrottlerStorage` + `generateKey`
    giữ prefix `throttler:` và tracker, nên `GET /admin/ratelimit/top` SCAN được top
    bucket. Còn thiếu: **trang UI** (chưa có màn hình nào gọi endpoint này) và cảnh báo khi
    một IP/user vượt ngưỡng; tracker đã bị băm từ trước thì hiện nguyên key thay vì bịa IP.
24. ◐ Nhật ký đăng nhập admin — **đã có** `lastLoginAt`/`lastLoginIp` ghi ở `AuthService.login`
    và hiện trong `UserDetail` (IP nội bộ bị ẩn); đăng nhập của admin ghi audit riêng
    `admin_login` (target `user`, payload `{ip}`) qua model trực tiếp để tránh vòng
    import AuthModule → AdminModule. Còn thiếu: **không có lịch sử nhiều lần** trong
    `UserDetail` (chỉ lần gần nhất — muốn xem lịch sử thì lọc Audit log theo `admin_login`).
25. ✓ Chế độ "view as user" — token 5 phút chỉ đọc, `JwtAuthGuard` chặn mọi method ghi khi
    `imp`, không xem thay chính mình/admin khác, audit `impersonate_start`, banner đếm
    ngược + khôi phục token admin, nút "Xem thay" trong `UserDetail` (chỉ super, ẩn với
    tài khoản quản trị/đã xoá).

## Thứ tự đề xuất (giá trị/rủi ro) — cập nhật 2026-10-27 (sau vòng hoàn thiện)

Đã xong từ danh sách cũ: (2) ban có lý do + tự gỡ, (3) lịch sử vi phạm, (4) thu hồi
phiên + từng thiết bị, (6) 2FA TOTP, (8) media hội thoại, (9) hàng đợi kiểm duyệt,
(12) kháng nghị phía admin, (14) broadcast target + lịch sử, (15) push log, (16) OTP
log, (17) cấu hình động, (20) can thiệp đơn, (21) hoa hồng, (22) đối soát GMV,
(23) endpoint rate-limit, (24) dashboard nhật ký đăng nhập, (25) xem thay người dùng.

Còn lại, ưu tiên theo "đang hỏng" trước "đang thiếu":

| # | Việc | Vì sao trước | Cỡ |
|---|---|---|---|
| 0 | **Nút "Xem thay" đã có** nhưng cần kiểm tra lại trên UI thật (chưa click-test bằng trình duyệt) | Backend + test đã xanh; đây là đường cấp token nên phải thử tay một lần | XS |
| 1 | **Endpoint người dùng nộp kháng nghị** (#12) | Hàng đợi appeal hiện không có nguồn dữ liệu thật — phải làm phía mobile | S |
| 2 | **Matrix quyền chi tiết + bắt buộc 2FA admin** (#5, #6) | Đã chặn 5 route super-only, nhưng "support chỉ-đọc" chưa thực thi; điều kiện trước khi thuê moderator | M |
| 3 | **Broadcast FCM fallback + room theo loại tài khoản** (#14) | Người offline hiện không nhận được gì; audience personal/business đang fanout toàn bộ | M |
| 4 | **Report detail có media + bật lại deep-link focus** (#8, #10) | Moderator vẫn phải quyết định "mù" ở trang báo cáo; `focus` param chưa được đọc | S |
| 5 | **Trang UI rate-limit + cảnh báo** (#23) | Endpoint `/admin/ratelimit/top` đã có, thiếu mặt hiển thị | S |
| 6 | **Auto-mod assist đầy đủ** (#11) | Cần định nghĩa từ khóa/spam — schema mới | L |

Lưu ý: `docs/task1.md` mô tả **mặt admin**. Các mục cần schema mới (#11, lịch sử
health) nên đi qua OpenSpec proposal trước khi code; phần nộp kháng nghị (#12) phụ
thuộc mobile.
