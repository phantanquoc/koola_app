## 1. Hoàn thiện tài liệu
- [x] 1.1 Đồng bộ proposal.md, design.md và spec delta bằng tiếng Việt, chốt phạm vi vertical feed và các non-goal
- [x] 1.2 Bổ sung ma trận resolver, hành vi refresh/scroll-hide và điều kiện dọn lab vào spec delta, gồm contract lifecycle/preview của mock Post

## 2. Ghép feed vào MomentsScreen
- [x] 2.1 Chạy impact cho MomentsScreen và các symbol/function/method sẽ chỉnh; đọc caller/dependent trong phạm vi
- [x] 2.2 Tách dữ liệu `FeedPost[]` mẫu sang module riêng, không gọi backend
- [x] 2.3 Đổi MomentsScreen sang một FlatList dọc với MomentsFeedHeader làm ListHeaderComponent và PostCard rows
- [x] 2.4 Chuyển RefreshControl sang FlatList dọc, giữ cấu hình list an toàn cho Fabric
- [x] 2.5 Nối ChatSubTabVisibilityContext theo pattern ConversationListScreen
- [x] 2.6 Dùng resolveMomentsStoryRegion mô tả riêng vùng dải vòng story và cập nhật test resolver

## 5. Sửa hồi quy phát hiện trên thiết bị (2026-08-11)
- [x] 5.1 Chạy impact cho MomentsScreen + resolveMomentsView trước khi sửa (LOW risk)
- [x] 5.2 Bỏ gate cả màn hình: header (`MomentsFeedHeader`) và feed PostCard mẫu LUÔN render trong Pha 1, không phụ thuộc story thật
- [x] 5.3 Chuyển trạng thái story (loading/error/friend-empty) thành banner không chặn trong luồng header; error giữ retry, friend-empty giữ creation action mở MomentComposer + gợi ý kéo tải lại
- [x] 5.4 Đổi resolver sang resolveMomentsStoryRegion({ isLoading, error, hasFriendRings }); cập nhật momentsView.spec.ts và MomentsScreen.spec.tsx cho khớp hành vi đúng (header luôn render, feed luôn có data)
- [x] 5.5 Cập nhật living spec + proposal/design/spec delta của change này; chạy tsc/eslint/jest và gitnexus detect_changes

## 3. Dọn entry point lab
- [x] 3.1 Xóa MomentsFeedLabScreen khỏi source
- [x] 3.2 Xóa route `__DEV__`, type điều hướng và mục Settings mở lab
- [x] 3.3 Giữ nguyên PostMediaGrid.spec.tsx và xác nhận không có import lab còn sót

## 4. Placeholder và kiểm tra
- [x] 4.1 Xóa raw JSX placeholder trong MomentComposerScreen nếu đúng text node, không đổi behavior
- [x] 4.2 Chạy tsc, eslint các file scope và tests moments/resolver; báo cáo lỗi ngoài scope
