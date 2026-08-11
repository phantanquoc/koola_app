## MODIFIED Requirements

### Requirement: Story feed hiển thị cùng định dạng bảng tin
Màn hình Khoảnh khắc SHALL hiển thị một danh sách `FlatList` dọc duy nhất. `MomentsFeedHeader` MUST là `ListHeaderComponent`, còn các bài viết mẫu MUST được render bằng `PostCard` ở các dòng của danh sách. Dải vòng story vẫn dùng dữ liệu và hành vi hiện có, không thay đổi ngữ nghĩa story.

#### Scenario: Hiển thị header và bài viết mẫu
- **WHEN** người dùng mở tab Khoảnh khắc
- **THEN** màn hình hiển thị ô gợi ý đăng, ba thao tác nhanh, dải vòng story trong `MomentsFeedHeader`, sau đó hiển thị từng bài viết mẫu bằng `PostCard`

#### Scenario: Kéo để làm mới bảng tin
- **WHEN** người dùng kéo danh sách dọc xuống ở đầu danh sách
- **THEN** `RefreshControl` của danh sách dọc gọi `momentsService.refreshFeed()` và không gắn refresh control vào dải vòng ngang

#### Scenario: Tương tác với bài viết chưa có backend
- **WHEN** người dùng thích, mở bình luận, chia sẻ, mở menu hoặc mở media của bài viết mẫu
- **THEN** nút thích đổi trạng thái cục bộ; các thao tác còn lại hiển thị thông báo chức năng chưa sẵn sàng, không giả vờ ghi dữ liệu thành công

### Requirement: Trạng thái vùng dải vòng story không làm trắng màn hình
Resolver `resolveMomentsStoryRegion` SHALL nhận `isLoading`, `error` và `hasFriendRings`, và CHỈ mô tả trạng thái của vùng dải vòng story — KHÔNG phải công tắc bật/tắt cả màn hình. `MomentsFeedHeader` (ô gợi ý đăng, ba thao tác nhanh, dải vòng chứa own ring) và feed PostCard mẫu của Pha 1 MUST luôn render khi có user đăng nhập, độc lập với việc có story thật hay không. Các trạng thái loading/error/friend-empty của vùng story MUST hiển thị dưới dạng banner không chặn trong luồng header, KHÔNG thay thế toàn bộ màn hình và KHÔNG làm trắng màn hình.

Thứ tự ưu tiên là `ready` (đã có ring bạn bè, giữ nguyên kể cả khi refresh âm thầm hoặc lỗi tạm thời), rồi `loading`, `error`, `friend-empty`. Vì own ring luôn được tổng hợp sẵn nên tín hiệu nội dung có ý nghĩa là `hasFriendRings`, không phải "có ring bất kỳ".

**Sửa hồi quy 2026-08-11 (phát hiện trên thiết bị thật):** Bản trước của change này dùng resolver 4 trạng thái `content/skeleton/error/empty` tính từ `state.feedRing.length` để gate cả `ListHeaderComponent` lẫn `data` của FlatList. Máy user chưa có story bạn bè → feedRing rỗng → viewState='empty' → toàn bộ Pha 1 (header, thao tác nhanh, dải vòng, PostCard mẫu) biến mất, chỉ còn empty state trắng. Lỗi thiết kế điều kiện, không phải lỗi resolver. Resolver mới chỉ mô tả vùng story; nó không còn quyền ẩn header hay feed. Scenario cũ "Story feed rỗng sau khi tải thành công ... không hiển thị mock header/PostCard preview" chính là nguồn của lỗi và đã bị thay thế.

#### Scenario: Đã có story của bạn bè
- **WHEN** `hasFriendRings = true`
- **THEN** resolver trả về `ready` và không hiển thị banner trạng thái nào cho vùng story

#### Scenario: Vùng story đang cold-loading không làm trắng màn hình
- **WHEN** story service chưa có ring bạn bè, request đầu tiên đang loading (kể cả frame đầu trước khi `useFocusEffect` gọi `refreshFeed`)
- **THEN** resolver trả về `loading`; `MomentsScreen` hiển thị banner tải không chặn trong header, VẪN render header/composer/quick action/own ring và feed PostCard mẫu, KHÔNG ẩn header và KHÔNG làm trắng màn hình, KHÔNG nhấp nháy sang friend-empty

#### Scenario: Vùng story lỗi khi chưa có story bạn bè không làm trắng màn hình
- **WHEN** story service không có ring bạn bè và request kết thúc với lỗi
- **THEN** resolver trả về `error`; `MomentsScreen` hiển thị thông báo lỗi inline không chặn (kèm retry gọi lại `momentsService.refreshFeed()`) trong luồng feed, KHÔNG thay thế toàn bộ màn hình; header và feed mẫu vẫn hiển thị

#### Scenario: Bạn bè chưa đăng khoảnh khắc
- **WHEN** `hasFriendRings = false`, không loading và không có lỗi
- **THEN** resolver trả về `friend-empty`; `MomentsScreen` hiển thị card không chặn "bạn bè chưa đăng khoảnh khắc" kèm creation action (`actionLabel` + `onActionPress`) mở `MomentComposer` và gợi ý kéo để tải lại; header, own ring và feed PostCard mẫu vẫn hiển thị (đúng yêu cầu "Moments entry state presentation", scenario "No friend Moments are available")

#### Scenario: Giữ ổn định khi refresh âm thầm hoặc lỗi tạm thời
- **WHEN** `hasFriendRings = true` và (`isLoading = true` hoặc `error` khác null)
- **THEN** resolver vẫn trả về `ready`; dải vòng story không nhấp nháy về placeholder

### Requirement: Thanh sub-tab phản ứng theo cuộn Moments
MomentsScreen SHALL nối `ChatSubTabVisibilityContext` theo cùng hợp đồng với `ConversationListScreen`: cuộn xuống làm tăng tiến trình ẩn, cuộn lên làm giảm tiến trình ẩn, và các ngưỡng/thời gian chuyển tiếp hiện có được giữ nhất quán.

#### Scenario: Cuộn xuống danh sách bài viết
- **WHEN** người dùng cuộn dọc xuống vượt ngưỡng thay đổi hướng
- **THEN** thanh sub-tab chuyển dần sang trạng thái ẩn theo `hiddenProgress`

#### Scenario: Cuộn lên danh sách bài viết
- **WHEN** người dùng cuộn dọc lên vượt ngưỡng thay đổi hướng
- **THEN** thanh sub-tab chuyển dần về trạng thái hiện theo `hiddenProgress`

### Requirement: Dữ liệu bài viết mẫu tách khỏi màn hình
Pha 1 SHALL cung cấp dữ liệu bài viết mẫu trong một module riêng có kiểu `FeedPost`, ghi rõ đây là scaffolding tạm thời. Module này MUST không gọi backend và MUST có thể được thay bằng nguồn dữ liệu thật ở Pha 2 mà không sửa interface của các component feed.

#### Scenario: Màn hình dùng nguồn mock riêng
- **WHEN** MomentsScreen dựng danh sách bài viết
- **THEN** danh sách được import từ module mock riêng và không thêm request Post vào `momentsService`

### Requirement: Xóa màn hình lab sau khi format được tích hợp
Sau khi format feed đã chạy trên MomentsScreen thật, hệ thống SHALL xóa `MomentsFeedLabScreen` cùng route `__DEV__`, kiểu điều hướng `MomentsFeedLab` và mục Settings mở lab. Test `PostMediaGrid.spec.tsx` MUST vẫn được giữ lại.

#### Scenario: Không còn entry point lab
- **WHEN** build hoặc chạy ứng dụng
- **THEN** không còn route/type/mục Settings nào mở `MomentsFeedLab`, trong khi component production và test `PostMediaGrid.spec.tsx` vẫn tồn tại
