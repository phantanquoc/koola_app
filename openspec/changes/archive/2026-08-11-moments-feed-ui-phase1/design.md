## Bối cảnh

`MomentsScreen` là một trong năm màn hình bên trong `TopTab.Navigator` của `ChatHomeScreen`, nằm dưới `KoolaHeader` dùng chung và thanh sub-tab tùy biến. Vì vậy màn hình không được tự tạo header cấp ứng dụng và phải tham gia hợp đồng ẩn/hiện sub-tab khi cuộn.

Hiện màn hình chỉ dựng một khối tiêu đề cố định và một thẻ chứa danh sách vòng story ngang. Danh sách vòng đang sở hữu `RefreshControl`; khi thêm bảng tin dọc, refresh phải chuyển sang danh sách ngoài cùng.

`MomentsFeedLabScreen` đã kiểm chứng định dạng đích bằng dữ liệu mẫu: một `FlatList` dọc, `MomentsFeedHeader` làm `ListHeaderComponent`, các dòng là `PostCard`. Lab có hàng back/title riêng vì được mở như route stack; `MomentsScreen` thật không được mang hàng đó vì đã nằm dưới chrome chung.

## Mục tiêu và ngoài phạm vi

### Mục tiêu

- Ghép định dạng feed (header + các bài Post) vào `MomentsScreen` thật.
- Cho resolver xét đồng thời số vòng story và số bài Post.
- Đặt dữ liệu Post mẫu trong một module riêng để Pha 2 thay nguồn dữ liệu mà không sửa interface component.
- Nối Moments vào hợp đồng ẩn/hiện sub-tab như `ConversationListScreen`.
- Xóa màn hình lab và toàn bộ entry point của lab sau khi định dạng thật đã hoạt động.

### Ngoài phạm vi

- Không thêm schema, REST route, socket event hay persistence cho Post.
- Không sửa `momentsService`, ngữ nghĩa story, story viewer, composer, music lifecycle hoặc backend.
- Không thêm dependency, không dùng `BlurView` hay FlashList.
- Không bật `removeClippedSubviews`; Fabric từng crash khi bật tùy chọn này lúc back-nav.
- Không đưa ra tuyên bố đo hiệu năng trong Pha 1.
- Placeholder trong `MomentComposerScreen` chỉ được xóa nếu đúng là raw JSX text node vô nghĩa; không thay đổi hành vi composer.

## Thiết kế triển khai

### 1. Một danh sách dọc duy nhất

`MomentsScreen` dùng một `FlatList` dọc làm scroller chính. `MomentsFeedHeader` được truyền qua `ListHeaderComponent`; danh sách `FeedPost[]` mẫu được truyền qua `data` và mỗi dòng render `PostCard`. Dải vòng story vẫn là danh sách ngang bên trong header, tức là lồng danh sách theo hai trục khác nhau như bản lab đã kiểm chứng.

Các cấu hình bắt đầu của danh sách dọc giữ theo cấu hình đã đo cho chat: `maxToRenderPerBatch: 5`, `updateCellsBatchingPeriod: 100`, `windowSize: 7`, `removeClippedSubviews: false`. Các post có key ổn định từ mock data. Header và row dùng callback ổn định để tránh tạo lại không cần thiết.

`RefreshControl` chỉ gắn vào `FlatList` dọc và vẫn gọi `momentsService.refreshFeed()`. Không thay đổi semantics refresh, chỉ thay đổi scroll host.

### 2. Nguồn dữ liệu mock

Tạo một module tại `ChatApp/src/screens/main/momentsMockPosts.ts` xuất `FeedPost[]`. File phải có chú thích rõ đây là scaffolding Pha 1 và sẽ được thay khi backend Post của Pha 2 tồn tại. `MomentsScreen` chỉ import mảng này; module không được gọi service hay network.

### 3. Tương tác header và PostCard

Tái sử dụng nguyên interface của `MomentsFeedHeader`, `PostCard` và `PostMediaGrid`.

- Composer prompt và thao tác `Ảnh/video` điều hướng tới route `MomentComposer` hiện có.
- `Nổi bật` điều hướng tới route `Highlights` hiện có.
- `Nhạc` điều hướng tới `MomentComposer`, vì `MusicPicker` thuộc state machine của composer và không có route độc lập.
- Like chỉ toggle optimistic trong state cục bộ của màn hình.
- Comment, share, menu và mở media gọi `useComingSoonToast` để phản hồi trung thực; không giả lập ghi dữ liệu.

### 4. Trạng thái vùng dải vòng story (sửa hồi quy 2026-08-11)

**Bản đầu (sai, gây hồi quy):** `resolveMomentsView({ isLoading, error, ringsLength, postsLength })` tính một view-state 4 trạng thái `content/skeleton/error/empty` cho CẢ MÀN HÌNH, với `ringsLength = state.feedRing.length`. `showMockPreview = viewState === 'content' && posts.length > 0` gate cả `data`, `ListHeaderComponent` lẫn `ListFooterComponent`. Máy user chưa có story bạn bè → feedRing rỗng → viewState='empty' → header, thao tác nhanh, dải vòng và toàn bộ PostCard mẫu biến mất, chỉ còn `ListEmptyComponent` trắng. Đây là lỗi thiết kế điều kiện: một resolver mô tả vùng story lại được dùng làm công tắc bật/tắt cả màn hình.

**Bản sửa (đúng):** Đổi resolver thành `resolveMomentsStoryRegion({ isLoading, error, hasFriendRings })` trả về `'loading' | 'error' | 'friend-empty' | 'ready'`, CHỈ mô tả vùng dải vòng story. Thứ tự ưu tiên: `ready` (có ring bạn bè, giữ nguyên khi refresh âm thầm/lỗi tạm thời), rồi `loading`, `error`, `friend-empty`. Vì own ring luôn được tổng hợp (`ownRing`), tín hiệu nội dung có ý nghĩa là `hasFriendRings = otherRings.length > 0`, không phải "có ring bất kỳ".

`MomentsScreen` render như sau, KHÔNG gate gì sau story thật:

- `FlatList.data = posts` — feed PostCard mẫu LUÔN render trong Pha 1 (đây là toàn bộ giá trị của Pha 1: cho user duyệt hình dáng feed trên tab thật).
- `ListHeaderComponent = listHeader` — `MomentsFeedHeader` (ô gợi ý đăng + ba thao tác nhanh + dải vòng chứa own ring) LUÔN render khi có user. Bên dưới header là `storyRegionBanner`.
- `storyRegionBanner` là banner KHÔNG CHẶN trong luồng header: `loading` → dòng ActivityIndicator + caption nhỏ; `error` → `KoolaErrorState` inline kèm retry gọi `requestFeed`; `friend-empty` → `KoolaEmptyState` inline kèm `actionLabel` + `onActionPress={handleAddPress}` mở `MomentComposer` và gợi ý kéo để tải lại; `ready` → `null`. Không còn `ListEmptyComponent`.
- `handleAddPress` và `storyRegionBanner` nằm trong dependency array của `listHeader`.

Nhờ vậy không trạng thái story nào làm trắng màn hình hay mất đường tạo khoảnh khắc. `friend-empty` khớp yêu cầu "Moments entry state presentation" scenario "No friend Moments are available".

Vì `momentsService` khởi tạo ở trạng thái idle trước khi `useFocusEffect` gọi fetch, `MomentsScreen` phải coi frame đầu chưa kích hoạt request là cold-loading (cờ cục bộ `hasAttemptedLoad`) để banner hiển thị `loading` thay vì nhấp nháy `friend-empty`. Retry dùng cùng callback refresh với pull-to-refresh. Cập nhật caller duy nhất, test resolver `momentsView.spec.ts` (ma trận theo `hasFriendRings` + loading/error/refresh âm thầm), và test cấp màn hình `MomentsScreen.spec.tsx` (header luôn render, feed luôn có data, banner không chặn, friend-empty vẫn có creation action).

### 5. Ẩn/hiện thanh sub-tab

Đọc `ChatSubTabVisibilityContext` trong `MomentsScreen`. Gắn `useAnimatedScrollHandler` cho `Animated.FlatList` theo cùng hình dạng với `ConversationListScreen`: so sánh `contentOffset.y` với offset trước, dùng ngưỡng 4/8px và các timing 180/220/260ms đang có để cập nhật `hiddenProgress`. Không tách hook dùng chung trong change này nhằm tránh sửa file ConversationListScreen và giữ diff dễ hoàn nguyên.

### 6. Dọn lab

Xóa `ChatApp/src/screens/dev/MomentsFeedLabScreen.tsx`. Xóa route `__DEV__` tương ứng khỏi `ChatTabStack.tsx`, xóa key `MomentsFeedLab` khỏi `ChatTabStackParamList` trong `navigation/types.ts`, và xóa mục Settings mở lab. Không xóa `PostMediaGrid.spec.tsx` vì đây là test của component production.

### 7. Placeholder composer

Kiểm tra raw JSX text `/* COMPOSER_PREVIEW_CONTINUE_PLACEHOLDER */` quanh dòng 301 trong `MomentComposerScreen.tsx`. Nếu node này thực sự nằm trực tiếp trong `ScrollView` children như brief mô tả, xóa duy nhất text node đó; không sửa state, callback, layout hoặc hành vi composer.

## Phân tích rủi ro và kiểm tra

- Refresh chuyển scroll host nên cần smoke test trên thiết bị để xác nhận gesture.
- Danh sách ngang trong header dọc có thể gặp gesture chéo; cần kiểm tra thiết bị thật.
- Năm bài Post mẫu làm nội dung hiển thị giả trong Pha 1; mọi thao tác chưa có backend phải có thông báo rõ ràng.
- Header có post media làm first paint nặng hơn; không kết luận hiệu năng trong change này.

Sau triển khai chạy TypeScript, ESLint cho các file thuộc phạm vi và test moments/resolver. Chạy `gitnexus detect_changes` trước khi kết thúc để kiểm tra symbol và execution flow bị ảnh hưởng. Lỗi nằm ngoài phạm vi không được tự sửa và phải được báo cáo.
