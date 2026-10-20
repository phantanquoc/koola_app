# Admin-web — Đối chiếu hiện trạng & checklist chuẩn (2026-10-15)

Ký hiệu: ✓ đã có / ◐ có nhưng thiếu / ✗ chưa có.

> Đối chiếu code lần cuối: 2026-10-20 (nhánh `feat/admin-p1-and-fixes`).

## A. Quản lý người dùng (core — app nào cũng phải có)

1. ✓ Tìm kiếm + lọc + phân trang users, xem detail, ban/unban
2. ◐ Ban có lý do + thời hạn + tự gỡ khi hết hạn — backend hỗ trợ (`reason`/`durationDays` trong `BanUserDto`, lưu `banReason`/`bannedUntil`, revoke refresh token) và UI đã gửi (dialog reason bắt buộc + select 1/3/7/30/vĩnh viễn — xong 2026-10-20); còn thiếu: job/cron tự gỡ khi hết hạn phía backend
3. ✓ Lịch sử vi phạm của 1 user — tab trong drawer user detail, gộp reports + audit actions (ban/unban/takedown/soft-delete) — xong 2026-10-20; nâng cấp sau: backend filter audit theo target thay vì scan 100 bản ghi
4. ✗ Khóa/mở thiết bị hoặc thu hồi session (refresh token) khi tài khoản bị hack
5. ✗ Phân vai trò admin (super-admin / moderator / support chỉ-đọc) + matrix quyền — hiện tại 1 role; interceptor 403 đã sửa (hiện màn "bị hạ quyền", không đá về login — verify 2026-10-20)
6. ✗ 2FA cho tài khoản admin

## B. Kiểm duyệt nội dung (đặc thù chat/moments)

7. ✓ Tìm tin nhắn + xóa mềm, gỡ story, xử lý report
8. ◐ Detail hội thoại đã có UI (`ConversationsPage` gọi `GET /admin/conversations/:id` — verify 2026-10-20); ✓ report link tới target (drawer moderation context + deep-link `/messages?focus=` `/conversations?focus=` `/users?search=` `/moments?focus=` — xong 2026-10-20)
9. ✗ Hàng đợi kiểm duyệt tập trung (reports + nội dung auto-flag + Moments chờ duyệt gộp 1 queue theo độ ưu tiên)
10. ✗ Xem được media (ảnh/video/story) trước khi gỡ — hiện gỡ "mù" (ghi nợ backend: cần `GET /admin/media/preview?key=` — `GET /media/:mediaKey` hiện yêu cầu membership conversation nên admin bị 403; drawer đã hiện mediaKey thô)
11. ✗ Auto-mod assist: gắn cờ từ khóa/spam, rate-limit bất thường, user bị report nhiều lần tự nổi lên
12. ✗ Kháng nghị (appeal): user khiếu nại quyết định takedown/ban, moderator xử lý vòng 2

## C. Dữ liệu & vận hành

13. ✓ Dashboard stats, analytics cơ bản, health check, audit log, broadcast
14. ◐ Audit log chưa lọc/xem payload; ◐ health chưa lịch sử uptime/latency; ◐ broadcast chưa target/lịch/lịch sử đã gửi
15. ✗ Quản trị push/FCM (xem template, gửi thử theo userId, tỉ lệ delivered)
16. ✗ Quản trị OTP/SMS (tỉ lệ gửi thành công, chặn số spam, xem log gửi theo số điện thoại)
17. ✗ Cấu hình động (feature flag, maintenance mode, version ép update, thông báo hệ thống) — không phải deploy để đổi
18. ✗ Export dữ liệu (CSV users/orders/reports) phục vụ đối soát/kế toán/pháp lý

## D. Thương mại (vì Koola có commerce)

19. ✓ CRUD product, xem orders + detail, sellers picker
20. ✗ Can thiệp đơn (đổi trạng thái, hoàn tiền, ghi chú nội bộ) — hiện read-only
21. ✗ Duyệt seller + quản lý hoa hồng/phí
22. ✗ Đối soát doanh thu (GMV, hoàn/hủy theo seller theo ngày)

## E. An toàn nền tảng

23. ✗ Rate-limit/quota monitor (ai đang spam API, top abusive IPs)
24. ✗ Nhật ký đăng nhập admin (ai đã vào, từ IP nào) — khác với audit log thao tác
25. ✗ Chế độ "view as user" hoặc giả lập tài khoản để debug khiếu nại

## Thứ tự đề xuất (giá trị/rủi ro)

1. Detail hội thoại + link report→target + xem media trước khi gỡ (rẻ, API đã có 1 phần; gỡ mù = rủi ro oan sai cao nhất)
2. Ban có lý do + duration + lịch sử vi phạm theo user (backend đã hỗ trợ, chỉ thiếu UI)
3. Bulk approve doanh nghiệp + search server-side Businesses (queue xác minh sẽ nghẽn khi seller tăng)
4. Phân vai trò admin + sửa interceptor 403 (điều kiện tiên quyết trước khi thuê moderator/support)
5. Can thiệp đơn hàng + đối soát GMV (khi commerce có giao dịch thật)
