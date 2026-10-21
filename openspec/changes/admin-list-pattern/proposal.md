# admin-list-pattern — Proposal (tầng mẫu chung)

## Summary
Chuẩn hóa mọi trang queue/list trong admin-web thành một mẫu duy nhất:
header gộp một hàng, tabs có "Tất cả", bảng compact sort được, actions icon-only,
pagination đầy đủ, skeleton giữ toolbar, retry khi lỗi, phím tắt vận hành,
click-hàng mở drawer, toast có Hoàn tác, BulkBar, export CSV, PII che mặc định.
Trang Businesses làm mẫu đầu tiên; Users/Orders/Products/Messages áp theo.

## Motivation
Trang Businesses hiện tại (ảnh chụp 2026-10-20) tốn 4 tầng text cho cùng một ý,
cột Trạng thái thừa trong tab đã lọc, bảng 7 cột vỡ trên mobile 390px,
không sort được, không retry khi mất mạng, selection treo khi đổi filter,
toast mất dấu sau khi chuyển tab. Mọi trang list khác sẽ lặp lại y nguyên
nếu không chốt mẫu chung trước.

## Scope

### In scope
- Header gộp: `Title (count)` + search + filter + nút chính trên một hàng;
  bỏ card title/subtitle trùng với tab.
- Tabs có "Tất cả" đầu tiên; tab con ẩn cột trùng (VD cột Trạng thái trong
  tab đã lọc); state tab/search/page/sort trong URL.
- Bảng compact: sort click-header (`aria-sort`), cột ID rút gọn + copy,
  actions icon-only + tooltip, click-hàng mở drawer, checkbox bulk.
- Pagination: số trang hiện tại, goto, page-size 10/20/50, tổng số.
- Loading: skeleton rows giữ nguyên toolbar; lỗi: StateBlock + nút Thử lại.
- Phím tắt queue: J/K di chuyển, A duyệt, R từ chối, Enter mở drawer, ? trợ giúp.
- Toast có action Hoàn tác 10s cho mutation nhầm.
- BulkBar + ConfirmDialog preview + requireText cho diện rộng.
- Export CSV theo filter hiện tại (cap + lọc ngày, DESIGN §7).
- PII che mặc định, click-to-reveal, tự che sau 30s (DESIGN §7).
- Mobile ≤860px: ẩn cột phụ, giữ Tên + Trạng thái + actions.
- CSS còn thiếu: `.confirm-list`, `.data-table--compact`, cột actions sticky.

### Out of scope
- Logic nghiệp vụ riêng từng trang (vòng đời xác minh, chống gian lận...)
  → thuộc `admin-business-workbench` và các change riêng sau này.
- Realtime socket (đợt sau, bật `refetchOnWindowFocus` cho queue là đủ trước mắt).

## Deliverables
- Kit dùng chung: `ListHeader`, `StatusTabs`, `DataTable` (sort + select),
  `Pagination` mở rộng, `UndoToast`, `ExportButton`, `MaskedPII`.
- `BusinessesPage` + `BusinessDetailDrawer` refactor theo mẫu.
- Checklist "áp mẫu cho trang mới" trong DESIGN.md §3A.
