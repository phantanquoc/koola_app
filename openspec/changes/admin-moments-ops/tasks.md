# Tasks

> **Scope guard**: chỉ `chat-backend/src/admin/**` và `admin-web/**`. Không sửa `ChatApp/**`,
> `chat-backend/src/moments/**`, không thêm field schema, không migration.
>
> **Rule**: không có duyệt trước. Bài đăng và story lên feed ngay khi người dùng đăng.

## 1. Backend — bài đăng

- [x] 1.1 `admin/dto/list-posts.dto.ts` — class kế thừa `PaginationDto`, `active` là `'true'|'false'`
      string + `@IsIn` (boolean bị `enableImplicitConversion` biến `"false"` thành `true`); verify
      jest: `?active=false` lọc `isActive:false`, giá trị khác → 400
- [x] 1.2 `admin/moments/admin-moments.service.ts` — `listPosts` batching (1 user lookup + 1 report
      aggregate + 1 presign batch cho cả trang); `findOnePost` không lọc `isActive` + `pendingReportCount`;
      404 cho id rác/không tồn tại
- [x] 1.3 `takedownPost` / `restorePost` idempotent (`changed:false` lần hai, không audit, không emit);
      takedown emit `post.deleted` tới `user:<authorId>`; restore không emit (không có payload đầy đủ)
- [x] 1.4 `admin/moments/admin-moments.controller.ts` — `@Controller('admin/posts')`, guard + throttle
- [x] 1.5 `admin.module.ts` — đăng ký `Post` schema, controller, provider; không import `MomentsModule`
- [x] 1.6 Jest: `admin/moments/admin-moments.service.spec.ts` (12 case) — active string, batching,
      media array, idempotency cả hai chiều, 404

## 2. Backend — story restore + sự kiện

- [x] 2.1 `POST /admin/stories/:id/restore` — idempotent, audit `restore_story`, không emit
      (story đã bị xoá khỏi state client; `story.new` cần payload mà route này không dựng)
- [x] 2.2 Takedown story: idempotent + đổi event `story_deleted` → `story.deleted` (tên client
      thật sự nghe trong `socketEventRouter.ts`), scope `user:<authorId>` thay vì `io.emit`
- [x] 2.3 ObjectId guard trước `findById` ở cả takedown và restore
- [x] 2.4 Jest trong `admin-moderation.controller.spec.ts`: 5 case (idempotent cả hai chiều,
      audit, 404, event name)

## 3. Backend — báo cáo bài đăng

- [x] 3.1 `AdminReportService.enrich` nhánh `post`: caption → `targetName`, tác giả →
      `targetDetail`, media[0] → `targetMediaUrl`/`targetThumbnailUrl`/`targetMediaType`;
      mọi key của bài vào batch `presignMany` sẵn có
- [x] 3.2 `ExportReportsDto.targetType` nhận `post` (thiếu bước này export lọc post trả 400 dù list cho phép)
- [x] 3.3 `ModerationQueueService`: `'post-reports'` kind, `PRIORITY = 88` (trên message 85 — bài công
      khai và không tự hết hạn), cluster post, bỏ qua bài đã gỡ
- [x] 3.4 `ADMIN_AUDIT_ACTIONS` thêm `takedown_post`, `restore_post`, `restore_story`;
      `ADMIN_AUDIT_TARGET_TYPES` thêm `post`
- [x] 3.5 Jest: 3 case enrich post + 3 case queue

## 4. Frontend — nhãn

- [x] 4.1 `report-labels.ts` — `'post'` vào union + `REPORT_TARGET_LABELS` (tự động thêm option lọc,
      CSV, chip) + `reportTargetHref('post') → /posts?focus=`
- [x] 4.2 `audit-labels.ts` — nhãn 3 action mới, `post` target, tone danger/success
- [x] 4.3 `ModerationQueuePage.tsx` — `'post-reports'` kind + nhãn + tone
- [x] 4.4 Vitest `report-labels.test.ts`: nhãn, href, mọi loại trong map đều có route

## 5. Frontend — trang bài đăng

- [x] 5.1 `pages/PostsPage.tsx` — list archetype §3A, tabs Tất cả/Đang hiển thị/Đã gỡ, deep-link
      `?focus=`, lightbox media nhiều ảnh, gỡ (confirm) / khôi phục per-row, **không có nút duyệt**
- [x] 5.2 `pages/PostDetailPage.tsx` + `components/PostDetail.tsx` — nội dung, media đã ký, báo cáo
      chờ (resolve/dismiss qua confirm), lịch sử thao tác (`/admin/audit-logs?targetType=post&search=`),
      gỡ/khôi phục ở bottombar
- [x] 5.3 `App.tsx` route `/posts` + `/posts/:id`; `AppLayout.tsx` nav item + `routeTitles`
- [x] 5.4 Vitest `posts.test.tsx` (7 case): nhãn trạng thái, không có "duyệt", confirm trước khi gỡ,
      khôi phục chỉ khi đã gỡ, `active=false` là string, detail render + audit nhãn, resolve report

## 6. Gates + live

- [x] 6.1 `npx jest src/admin` → 330 pass; `tsc --noEmit` sạch
- [x] 6.2 `npx vitest run` → 255 pass; `npx tsc --noEmit` sạch
- [x] 6.3 Live trên backend Docker: list/detail 200; id rác → 404; `active=false` → 200;
      3 post × 3 báo cáo → queue có 3 mục `post-reports`, report có `targetName` + `targetDetail`;
      takedown → queue mất bài đó, lần hai `changed:false`; restore → audit đúng 2 dòng;
      export `targetType=post` → 200
- [x] 6.4 Live story: takedown `changed:true` → lần hai `changed:false` → restore `changed:true` →
      lần hai `changed:false`; audit đúng 2 dòng
- [x] 6.5 Dọn fixture QA (3 post, 9 report, 1 story, 4 audit) — `GET /admin/posts` về 0
- [x] 6.6 `openspec validate admin-moments-ops --strict`
- [x] 6.7 Docs: `admin-web/AGENTS.md` (`/moments` + `/posts`, API catalogue),
      `admin-web/DESIGN.md` (`post` là target type thứ năm)

## Ghi chú

- JSDoc/comment tiếng Việt trong các file mới ghi lý do, không lặp lại code.
- Không có control nào chết: mọi nút trên `/posts` và `/posts/:id` gọi endpoint thật.
- Nợ kỹ thuật đã biết, chưa làm: `MediaCleanupService` vẫn chưa đăng ký trong `MediaModule.providers`.
- Spec `moments-music-library` vẫn mô tả các route `POST/PATCH/DELETE /moments/music-tracks` đã bị xoá —
  cập nhật khi archive `music-catalog-ops`.
