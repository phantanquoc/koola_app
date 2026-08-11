## Vì sao

Tab Khoảnh khắc hiện chỉ hiển thị dải vòng story; vùng bên dưới luôn trống vì backend chưa có khả năng Post. `chat-backend/src/moments/` có các route cho story/highlight/audience/music nhưng không có schema hay endpoint Post. Demo `MomentsFeedLabScreen` đã kiểm chứng format bảng tin gồm ô gợi ý đăng, ba thao tác nhanh, dải vòng liền mạch và danh sách `PostCard`; các component `MomentsFeedHeader`, `PostCard`, `PostMediaGrid` đã được viết theo hướng tái sử dụng.

Pha 1 ghép format này vào `MomentsScreen` thật nhưng bài Post vẫn dùng dữ liệu mẫu. Đồng thời sửa `resolveMomentsView` để màn hình không rơi vào trạng thái `content` trống khi chỉ có vòng story hoặc chỉ có bài Post. Pha 2 là change riêng để bổ sung backend Post và thay nguồn dữ liệu mẫu bằng service thật.

Cách chia này cho phép duyệt hình dáng trên đúng tab thật trước khi đầu tư backend, đồng thời tránh viết lại UI khi sang Pha 2.

## Thay đổi

- Đổi `MomentsScreen` thành một `FlatList` dọc: `MomentsFeedHeader` làm `ListHeaderComponent`, các `PostCard` nằm bên dưới.
- Dùng `resolveMomentsStoryRegion({ isLoading, error, hasFriendRings })` chỉ mô tả trạng thái vùng dải vòng story (`loading | error | friend-empty | ready`), KHÔNG gate cả màn hình; cập nhật `momentsView.spec.ts` theo ma trận `hasFriendRings` + loading/error/refresh âm thầm. Caller lấy `hasFriendRings` từ `otherRings.length` (own ring luôn tổng hợp nên không tính là content).
- Dùng một module `FeedPost[]` mẫu riêng. Module không gọi backend, không chứa URL asset mạng và có thể được thay bằng nguồn thật ở Pha 2.
- **Sửa hồi quy 2026-08-11 (phát hiện trên thiết bị thật):** Bản đầu gate cả `ListHeaderComponent` lẫn `data` sau story thật (`showMockPreview = viewState === 'content'`), nên máy user chưa có story bạn bè thấy màn hình trắng, mất toàn bộ Pha 1. Bản sửa: header và feed PostCard mẫu LUÔN render; trạng thái story (loading/error/friend-empty) chỉ là banner không chặn trong luồng header, không thay thế màn hình. `friend-empty` giữ creation action mở `MomentComposer` + gợi ý kéo để tải lại; error giữ retry `refreshFeed`. Không trạng thái nào làm trắng màn hình hay mất đường tạo khoảnh khắc.
- Gắn `RefreshControl` vào danh sách dọc; không thay đổi service refresh hay semantics story.
- Nối `ChatSubTabVisibilityContext` theo pattern `ConversationListScreen` để thanh sub-tab ẩn/hiện nhất quán khi cuộn.
- Tái sử dụng `MomentsFeedHeader`, `PostCard`, `PostMediaGrid`; thao tác chưa có backend dùng `useComingSoonToast`, còn like chỉ đổi state cục bộ để phản hồi trực quan.
- Xóa `MomentsFeedLabScreen`, route `__DEV__`, type điều hướng và mục Settings mở lab. Giữ nguyên `PostMediaGrid.spec.tsx`.
- Chỉ xóa raw JSX placeholder vô nghĩa trong `MomentComposerScreen.tsx` nếu node đúng như brief; không đổi behavior composer.

## Ảnh hưởng

- Spec được bổ sung delta cho `moments-stories`, tập trung vào format feed, resolver hai nguồn, refresh, scroll-hide và dọn lab; không đổi ngữ nghĩa story hay hợp đồng API.
- Code chính: `MomentsScreen.tsx`, `momentsView.ts`, `momentsView.spec.ts`, module mock Post mới; wiring lab trong navigation và Settings.
- Không sửa backend, `momentsService`, Socket.IO, REST contract, story viewer, composer/music lifecycle hoặc thêm dependency.
- Không tạo Post schema/API/socket/persistence; toàn bộ nội dung Post trong Pha 1 là dữ liệu mẫu và các thao tác chưa có backend phải phản hồi trung thực.
