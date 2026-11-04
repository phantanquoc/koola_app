# Proposal

## Why

Bài đăng (Post) là một trong hai loại nội dung của Moments, nhưng admin **không có đường nào chạm tới nó**. Người dùng báo cáo bài đăng được (`POST /moments/posts/:id/report` ghi `targetType: 'post'` — `moments.service.ts:2092`), nhưng phía quản trị:

- Không có endpoint admin nào cho post → báo cáo bài đăng **không thể xử lý**.
- `admin-report.service.ts` không có nhánh `post` → mọi báo cáo bài đăng hiện "Đối tượng không còn tồn tại", khung nội dung rỗng, và không có media. Moderator quyết định "mù".
- `moderation-queue.service.ts` chỉ gom cluster `story`/`message` → bài đăng bị 20 báo cáo vẫn không lên hàng đợi ưu tiên.
- `report-labels.ts` thiếu `'post'` → dropdown lọc không chọn được, CSV và eyebrow in chuỗi thô `post`.
- `ExportReportsDto.targetType` là enum đóng → export lọc theo post trả 400 dù list cho phép.

Story thì ngược lại: gỡ được nhưng **không khôi phục được**, dù tin nhắn đã có `POST /admin/messages/:id/restore` làm mẫu. Một lần bấm nhầm là story mất khỏi feed vĩnh viễn (TTL không hồi sinh nó).

Phát hiện thêm khi đọc code: takedown story phát `story_deleted`, nhưng client mobile chỉ nghe `story.deleted` (`socketEventRouter.ts`). Tức là việc gỡ **thành công trong DB và vô hình với mọi app đang mở**.

## What Changes

**Không có duyệt trước.** Bài đăng và story vẫn lên feed ngay khi người dùng đăng. Không có hàng đợi "chờ duyệt", không có trạng thái "pending review", không chặn ai đăng bài. Admin chỉ can thiệp **sau khi** có báo cáo hoặc bị quét ra vi phạm.

- **BE — quản lý bài đăng**: `GET /admin/posts` (lọc `active`, `authorId`), `GET /admin/posts/:id` (không lọc `isActive` — moderator cần xem bài đã gỡ), `POST /admin/posts/:id/takedown`, `POST /admin/posts/:id/restore`. Mọi mutation idempotent và audited.
- **BE — story khôi phục**: `POST /admin/stories/:id/restore` + takedown thành idempotent.
- **BE — sửa event sai**: takedown story phát `story.deleted` (tên client thật sự nghe) thay vì `story_deleted`.
- **BE — báo cáo bài đăng hiển thị đúng**: `AdminReportService.enrich` có nhánh `post` — caption làm tên, media đầu tiên được ký, tên tác giả ở dòng phụ.
- **BE — hàng đợi ưu tiên**: cluster `post` với `PRIORITY['post-reports'] = 88` (trên message 85: bài công khai và không tự hết hạn như story).
- **BE — audit + export**: `takedown_post`, `restore_post`, `restore_story` actions; `post` target type; `ExportReportsDto` nhận `post`.
- **FE — nhãn**: `REPORT_TARGET_LABELS.post`, `reportTargetHref → /posts?focus=`, `AUDIT_ACTION_LABELS`/`AUDIT_TARGET_LABELS`, `QueueKind 'post-reports'`.
- **FE — trang mới**: `/posts` (list archetype §3A, deep-link `?focus=`) và `/posts/:id` (nội dung + media + báo cáo chờ + lịch sử thao tác + gỡ/khôi phục).

## Scope Boundary (binding)

Chỉ `chat-backend/src/admin/**` và `admin-web/**`.

Out of scope:
- `ChatApp/**` và `chat-backend/src/moments/**` — không sửa dòng nào. Response shape mobile đang đọc giữ nguyên.
- Kiểm duyệt bình luận bài đăng (chưa cần — tác giả bình luận và chủ bài đã tự xoá được).
- Không thêm field schema, không migration. `Post.isActive` và `Story.isActive` đã đủ làm soft-delete.
- Không emit socket khi khôi phục (`post.new`/`story.new` cần payload đầy đủ mà route này không dựng; client đồng bộ ở lần tải feed kế tiếp).
- Không export CSV bài đăng (báo cáo đã export được; danh sách bài không phải hồ sơ pháp lý).

## Capabilities

### New Capabilities

- `admin-moments-ops`: API + màn quản trị bài đăng (list/detail/takedown/restore), story restore, và việc báo cáo bài đăng hiển thị đúng trong inbox/hàng đợi.

### Modified Capabilities

- `admin-moments-moderation`: thêm post + story restore vào bề mặt kiểm duyệt Moments.
- `admin-report-inbox`: `targetType` có thêm `post`, kèm yêu cầu resolve tên/media của nó.

## Impact

- **Backend** — mới: `admin/moments/admin-moments.{controller,service}.ts`, `admin/dto/list-posts.dto.ts`, spec tương ứng. Sửa: `admin-moderation.controller.ts` (story restore + event name), `admin-report.service.ts` (nhánh post), `moderation-queue.service.ts` (cluster post), `admin-export.controller.ts` (enum), `schemas/admin-audit-log.schema.ts` (actions/targets), `admin.module.ts` (Post model + controller + provider).
- **Frontend** — mới: `pages/PostsPage.tsx`, `pages/PostDetailPage.tsx`, `components/PostDetail.tsx`, tests. Sửa: `report-labels.ts`, `audit-labels.ts`, `ModerationQueuePage.tsx`, `App.tsx`, `AppLayout.tsx`.
- **Mobile** — không đổi. `story.deleted` là tên client đã nghe từ trước; việc sửa chỉ làm sự kiện đó **thực sự** được phát.
- **Docs** — `admin-web/AGENTS.md` (row `/moments`, `/posts`, API catalogue), `admin-web/DESIGN.md` (`post` là target type thứ năm).
