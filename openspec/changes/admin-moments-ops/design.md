# Design

## Vì sao tách slice riêng thay vì nhét vào `admin-moderation.controller.ts`

Controller đó đã 1312 dòng và inject 11 dependency. Thêm post vào nghĩa là inject thêm `Post` model,
thêm 4 route nữa, và file vượt xa trần 800 dòng. Slice `admin/moments/` giữ controller mới ~80 dòng và
service ~250 dòng — đọc được trong một lần.

## Vì sao không import `MomentsModule`

`MomentsService` là service hướng người dùng: nó kiểm tra quyền tác giả (`Not your post`) và emit
event feed. Admin cần ngược lại — bỏ qua quyền tác giả và emit có kiểm soát. Import module sẽ kéo
`GatewayModule`/`MessagesModule`/`NotificationsModule` vào `AdminModule`, tạo vòng phụ thuộc tiềm ẩn
(`GatewayModule` → `MessagesModule` → `ConversationsModule` → ...).

Thay vào đó slice mới inject thẳng `@InjectModel(Post.name)` + `ChatGateway` — cùng cách
`admin-moderation.controller.ts` đang làm với `Story`.

## Idempotency

Hợp đồng giống `POST /admin/messages/:id/restore`: trả `{ changed: boolean }`, và `changed: false`
nghĩa là **không có gì thay đổi** — không audit, không emit. Lý do: audit log là bằng chứng thao tác;
một dòng "admin đã gỡ bài" cho lần bấm thứ hai (khi bài vốn đã bị gỡ) làm sai lệch điều tra.

Story takedown trước đây **không** idempotent (luôn ghi audit). Đã sửa về cùng hợp đồng.

## Socket: emit cái gì, cho ai

| Hành động | Event | Room | Lý do |
|---|---|---|---|
| Gỡ bài đăng | `post.deleted` | `user:<authorId>` | Tác giả là client chắc chắn cần cập nhật; fanout cho audience cần connection set mà route này không tải. Feed lọc `isActive` nên người khác thấy đúng ở lần tải sau. |
| Khôi phục bài đăng | — | — | `post.new` mang theo view đã resolve; phát payload thiếu sẽ khiến client render rác. |
| Gỡ story | `story.deleted` | `user:<authorId>` | **Sửa tên**: trước đây phát `story_deleted`, tên mà không client nào đăng ký → gỡ thành công trong DB nhưng vô hình trên app đang mở. |
| Khôi phục story | — | — | Story đã bị xoá khỏi state client khi nhận `story.deleted`; `story.new` cũng cần payload đầy đủ. |

Đánh đổi được ghi rõ trong code, không im lặng: khôi phục hiển thị ở lần tải feed kế tiếp.

## Presign batching

`ModerationMediaService.presignMany` có trần 60 key/lần. Một trang 20 bài × 3 ảnh = 60 key vừa chạm
trần; nhiều hơn thì key dư trả `null` và render "Không tải được media".

Giữ nguyên trần thay vì ký batch thứ hai: trang dày như vậy là ngoại lệ, và thêm một round-trip cho
mọi trang là trả giá thường xuyên cho trường hợp hiếm. Ghi chú trong `enrich()`.

## `active` là string

`ValidationPipe` chạy với `transformOptions.enableImplicitConversion: true`. Với một field boolean,
query `?active=false` đến dưới dạng chuỗi `"false"` → `Boolean("false") === true` → lọc ngược.
Dùng `'true' | 'false'` + `@IsIn` vừa tránh bẫy, vừa khiến `?active=1` trả 400 thay vì đoán.

Đây là cùng lỗi đã gặp ở `music.dto.ts` (`unused`); comment trong DTO trỏ về đó.

## `pendingReportCount` ở list và detail

List trả số này để moderator thấy ngay bài nào có báo cáo mà không phải mở chi tiết. Một aggregate
`$group` theo `targetId` cho cả trang — không N+1.

Detail cũng trả, vì trang chi tiết vẫn cần con số hiển thị kể cả khi panel báo cáo đang tải.

## Không có duyệt, không có bulk

Đây là quyết định sản phẩm, không phải bỏ sót:
- Bài đăng lên feed ngay. Không có cờ "chờ duyệt", không có hàng đợi duyệt.
- Không có bulk takedown. Gỡ nội dung là thao tác riêng lẻ, có confirm; bulk biến một lần bấm nhầm
  thành hàng chục bài bị gỡ.

## Kiểm thử

- Jest chốt hợp đồng: string-filter, idempotency hai chiều, audit một lần, batching, enrich post,
  queue cluster, export 200.
- Vitest chốt UI: confirm trước khi gỡ, khôi phục chỉ hiện khi bài đã gỡ, `active=false` xuống server
  dạng string, audit code được dịch.
