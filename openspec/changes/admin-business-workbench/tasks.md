# admin-business-workbench — Tasks

Phụ thuộc: đợt 3 của `admin-list-pattern` (sort param, audit filter target).

## Schema (backend)
- [ ] Thêm `taxCode`, `licenseExpiresAt`, `verificationHistory[]`,
  `suspended`, `internalNote`, `assignee`, `deletedAt` vào User business fields
- [ ] Enum 63 tỉnh cho `province`; validate `taxCode` VN 10/13 số

## Endpoint (backend)
- [ ] `PATCH /admin/businesses/:id` (whitelist field + audit)
- [ ] `POST /admin/businesses/:id/disable` + `/enable` (syncSellers như approve)
- [ ] `POST /admin/businesses` tạo mới (validate + audit)
- [ ] `DELETE /admin/businesses/:id` soft-delete (confirm + audit, cấm xóa cứng)
- [ ] Guard `verificationStatus: 'pending'` trong approve/reject → 409
- [ ] Trùng lặp: `GET /admin/businesses/:id/duplicates` (cùng taxCode/license/SĐT)

## Frontend
- [ ] Badge trùng + rủi ro (TK mới, burst) trên hàng
- [ ] Timeline vòng đời trong drawer (từ audit-log)
- [ ] Tab "Sắp hết hạn" (licenseExpiresAt ≤ 30 ngày)
- [ ] Form sửa hồ sơ + form thêm mới (drawer)
- [ ] Nút Vô hiệu hóa/Kích hoạt ở tab Đã duyệt
- [ ] Map slug→tiếng Việt, SĐT format VN, PII che (dùng kit mẫu chung)

## Nghiệm thu
- [ ] Backend jest xanh (guard 409, duplicates, soft-delete)
- [ ] Frontend vitest + tsc xanh
- [ ] Spec `admin-business-verification/spec.md` cập nhật
- [ ] Archive change sau khi cả 2 tầng xong
