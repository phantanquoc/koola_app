# admin-business-workbench — Proposal (nghiệp vụ riêng business)

## Summary
Nâng trang Doanh nghiệp từ "queue duyệt mù" thành workbench xét duyệt:
phát hiện trùng lặp và gian lận ngay trên hàng, timeline vòng đời hồ sơ,
quản lý giấy phép hết hạn, sửa hồ sơ sai, vô hiệu hóa/kích hoạt, thêm mới,
chuẩn dữ liệu VN (mã số thuế, 63 tỉnh, slug tiếng Việt).

Kế thừa toàn bộ mẫu chung từ `admin-list-pattern`; change này chỉ chứa
phần riêng của nghiệp vụ xác minh doanh nghiệp.

## Motivation
- Trùng giấy phép/SĐT giữa các hồ sơ hiện không ai phát hiện — duyệt trùng
  là rủi ro pháp lý.
- Hồ sơ bị từ chối nộp lại thì mất dấu lần trước (rejectionReason ghi đè).
- Không có `licenseExpiresAt`, `taxCode` — seller hết phép vẫn bán.
- Sai địa chỉ/website chỉ có đường duyệt hoặc từ chối, không có đường sửa.
- Danh mục hiện slug (`food-beverage`), tỉnh text tự do → filter vỡ.

## Scope

### In scope
- Cảnh báo trùng: cùng licenseImageKey/taxCode/SĐT/email → badge trên hàng
  + link sang hồ sơ trùng.
- Flag rủi ro: tài khoản mới <7 ngày, burst nộp cùng IP/thiết bị.
- Timeline vòng đời trong drawer: nộp → từ chối (lý do) → nộp lại → duyệt,
  đọc từ audit-log (cần filter target từ đợt 3 mẫu chung).
- Schema thêm: `taxCode` (định danh chính), `licenseExpiresAt` + tab "Sắp hết hạn",
  `verificationHistory[]` (thay vì ghi đè reason), `suspended` tách khỏi `isBanned`,
  `internalNote`, `assignee`.
- `PATCH /admin/businesses/:id` sửa Danh mục/Tỉnh/Địa chỉ/Website (whitelist + audit).
- `POST /admin/businesses/:id/disable|enable` (tạm ẩn gian hàng, giữ dữ liệu).
- `POST /admin/businesses` tạo mới (nhập hộ seller lớn) qua drawer form.
- Soft-delete + confirm + audit (cấm xóa cứng).
- Chuẩn VN: map slug→tiếng Việt, enum 63 tỉnh, SĐT format VN, mã số thuế validate.
- Guard `verificationStatus: 'pending'` trong approve/reject (409 khi đã xử lý).

### Out of scope
- Mẫu list chung (thuộc `admin-list-pattern`).
- Auto-mod/ML phát hiện gian lận (tương lai, hiện tại rule-based là đủ).
- Kháng nghị appeal vòng 2 (task1.md B12, change riêng sau).

## Deliverables
- Backend: migration field mới, 4 endpoint (PATCH, disable/enable, create,
  soft-delete), guard pending, search mở rộng business.
- Frontend: badge trùng/rủi ro, timeline drawer, tab Sắp hết hạn, form sửa/tạo,
  chuẩn hiển thị VN.
- Spec `admin-business-verification/spec.md` cập nhật yêu cầu mới.
