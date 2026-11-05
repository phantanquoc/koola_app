# admin-list-pattern — Tasks

## Đợt 1 — Nhìn khác ngay (frontend thuần, không đụng backend)
- [ ] `ListHeader`: title + count + search + filter + nút chính một hàng
- [ ] `StatusTabs`: tab "Tất cả" đầu tiên, state trong URL, tab con ẩn cột trùng
- [ ] Icon actions + tooltip + click-hàng mở drawer (giữ nút Chi tiết cho a11y)
- [ ] Cột ID rút gọn + copy-on-click
- [ ] `Pagination` mở rộng: số trang, goto, page-size 10/20/50
- [ ] CSS thiếu: `.confirm-list`, `.data-table--compact`, actions sticky
- [ ] Skeleton rows giữ toolbar; StateBlock lỗi + nút Thử lại (dùng `refetch`)
- [ ] Clear selection khi tab/search/page đổi
- [ ] Mobile ≤860px: ẩn cột phụ
- [ ] Tuổi hồ sơ chỉ tô màu ở tab pending, tab khác text muted

## Đợt 2 — Năng suất vận hành (frontend thuần)
- [ ] Phím tắt J/K/A/R/Enter/? + bảng trợ giúp
- [ ] Chế độ "Xét tiếp": duyệt xong tự sang hồ sơ kế tiếp trong drawer
- [ ] Thumbnail license hover + lightbox 720px trên hàng
- [ ] `refetchOnWindowFocus: true` cho query queue
- [ ] Toast Hoàn tác 10s cho approve/reject nhầm
- [ ] Export CSV theo filter (cap + lọc ngày)
- [ ] PII che mặc định + click-to-reveal + tự che 30s
- [ ] Mini-metric đầu trang, click lọc xuống bảng

## Đợt 3 — Backend hỗ trợ mẫu chung
- [ ] Sort param (`?sort=field:dir`, whitelist field)
- [ ] Search mở rộng: SĐT, ID, mã định danh (ngoài displayName/email)
- [ ] Guard chống race: mutation kèm điều kiện trạng thái, 409 khi đã xử lý
- [ ] Bulk per-item: kết quả từng dòng thay vì `modifiedCount` chung
- [ ] Audit filter theo target (`?targetType=&targetId=`) cho timeline drawer
- [ ] Ghi chú nội bộ + phân công (assignee + filter "của tôi")

## Nghiệm thu
- [ ] Full vitest + tsc xanh
- [ ] Checklist DESIGN §8 pass trên 1440/860/390
- [ ] Businesses làm mẫu xong mới áp sang trang tiếp theo
