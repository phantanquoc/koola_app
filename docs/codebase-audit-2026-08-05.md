# Báo cáo phân tích toàn diện codebase APP_KOOLA

**Ngày:** 2026-08-05 · **Branch:** `wip/chat-scroll-phase1-phase2b` (3 commit ahead of master)
**Phạm vi:** `chat-backend/` (152 file TS) · `ChatApp/` (249 file TS/TSX) · `admin-web/` (22 file)
**Phương pháp:** codebase-retrieval + GitNexus + grep/trace trực tiếp + typecheck thực thi. Chỉ phân tích, không sửa code.

---

## 1. Tóm tắt điều hành

1. **UI có design system thật, không phải component rời rạc.** `ChatApp/src/ui/` là hệ 3 tầng token (primitive → semantic → component) với dark mode WCAG, reduce-motion, 5 file test. Vấn đề không nằm ở thiết kế mà ở **thực thi**: 678 số spacing thô so với 178 lần dùng `koolaSpacing` (tỉ lệ 3.8:1).
2. **Ba primitive overlay `KoolaSheet` / `KoolaDialog` / `KoolaMenu` có 0 consumer** (đã xác minh độc lập), trong khi **18 modal tự chế** đang chạy song song với 5 pattern khác nhau. Đây là điểm ROI cao nhất toàn dự án.
3. **12 file import tĩnh `koolaColors`** → các màn đó **không đổi màu khi bật dark mode**, nhưng nhìn qua code review thì trông vẫn "đúng chuẩn". Nguy hiểm hơn hardcode hex.
4. **Phân tách layer backend rất tốt.** 0 controller chạm Mongoose, 0 gateway ghi DB, DTO validation phủ 35/38 `@Body`, có global ValidationPipe + exception filter + interceptor.
5. **Nhưng có 1 lỗi chặn scale ngang thật sự:** `webrtc.gateway.ts:68` giữ `callTimeouts` trong RAM — clear ở instance khác là no-op, rò timer handle và có thể kết thúc nhầm cuộc gọi đang sống.
6. **2 vi phạm `io.emit()` global** ở `moments.gateway.ts:60,94` — mọi socket đang kết nối đều nhận story public, vừa là bài toán O(N) vừa lộ `storyId`/`authorId`.
7. **Rò quyền phòng chat:** không có `socketsLeave()` ở bất kỳ đâu — thành viên bị xoá khỏi nhóm vẫn tiếp tục nhận `new_message` cho tới khi tự disconnect.
8. **Một tính năng đang hỏng trong production:** `MessagesSearchController` khai báo `GET /messages/search` nhưng **không được đăng ký ở module nào**, trong khi mobile gọi route đó tại `apiService.ts:510`.
9. **12 lệnh `.populate('senderId')` là công vô ích** — `senderId` khai báo `String` không có `ref`, và đã xác minh **không nơi nào** (mobile lẫn backend) đọc shape đã populate.
10. **Chất lượng nền tảng cao:** mobile typecheck sạch 0 lỗi, 77 file test, 0 TODO/FIXME, 51 spec capability đã archive, socket listener cân bằng tuyệt đối 13 `on` / 13 `off`.

---

## 2. Bảng đánh giá theo hạng mục

| Hạng mục | Điểm | Lý do |
|---|---|---|
| **Hệ thống UI** | **6.5/10** | Design system xây tốt (3 tầng token, WCAG, reduce-motion) nhưng adoption kém: 3 primitive chết, 18 modal tự chế, 678 spacing thô, 12 file phá dark mode |
| **Cấu trúc backend** | **8.5/10** | Layer separation gần như hoàn hảo (0 vi phạm controller/gateway ghi DB), DTO đầy đủ, module hoá rõ. Trừ điểm: 9 vòng `forwardRef`, 3 cơ chế wiring service↔gateway khác nhau |
| **Cấu trúc mobile** | **7/10** | services/hooks/contexts/screens phân tầng rõ, colocation hợp lý. Trừ điểm: `src/components` phần lớn chỉ 1 consumer (không thực sự "shared"), không có state lib, `KoolaHeader` đặt sai chỗ |
| **Dư thừa** | **5.5/10** | 7 file mobile mồ côi + 5 file backend chết, 1 controller không đăng ký, 1 cron trùng, 4 bản format thời gian VN, 5 bản debounce, `uuid` thừa |
| **SOLID** | **6/10** | DIP là điểm yếu nhất: MinIO/FCM gọi trực tiếp SDK, 5 callback-setter thay abstraction. SRP vi phạm ở 3 god class (1469/1047/1042 LOC) |
| **Maintainability** | **7.5/10** | Mobile typecheck sạch, 77 test, 0 TODO, comment giải thích "tại sao" rất tốt. Trừ điểm: 4 module 0 test (gateway 615 LOC!), 48 `console.log` sót |
| **Scalability** | **5/10** | Nền Redis đã đúng (adapter, CallSessionService, cron). Nhưng `callTimeouts` in-memory là blocker thật, cộng 2 global emit O(N) |

**Điểm tổng thể: 6.6/10** — nền tảng kiến trúc tốt hơn mức trung bình đáng kể; điểm bị kéo xuống bởi một nhóm nhỏ vấn đề cụ thể, hầu hết sửa được nhanh.

---

## 3. Danh sách phát hiện chi tiết

### CRITICAL

**C1. `callTimeouts` in-memory phá vỡ multi-instance**
`chat-backend/src/webrtc/webrtc.gateway.ts:68` · set tại `:399`, `:470` · clear tại `:364`, `:429`, `:1035-1040`
Caller nối instance A (timer nằm heap A), callee `call_accept` rơi vào instance B qua Redis adapter → `clearCallTimeout` ở B không tìm thấy key, no-op. Timer ở A vẫn nổ sau 30s.
*Tác động:* rò timer handle mỗi cuộc gọi cross-instance; có thể emit `call_missed` và `endSession` một cuộc gọi **đang sống**. Chặn deploy nhiều instance.
*Khắc phục:* xoá hẳn Map, dựa vào `call-session-cron.service.ts` (đã multi-instance-safe, dùng Redis zset `initiated_sessions`). Cơ chế đúng **đã tồn tại sẵn**.

**C2. `io.emit()` global cho story PUBLIC**
`chat-backend/src/moments/moments.gateway.ts:60` (`story.new`), `:94` (`story.deleted`) — đã xác minh trực tiếp
*Tác động:* vi phạm rule dự án; 100k socket = 100k frame cho 1 story; lộ `storyId` + `authorId` cho cả người đã chặn tác giả.
*Khắc phục:* resolve danh sách viewer rồi emit theo `user:` room như 5 event còn lại trong chính file đó đã làm đúng.

**C3. Rò quyền phòng — không có `socketsLeave()` ở bất kỳ đâu**
Xác minh: grep `socketsLeave|socketsJoin` trả về **0 kết quả** toàn backend. Membership chỉ kiểm tại lúc join (`chat.gateway.ts:239`), không bao giờ kiểm lại lúc broadcast. Đường xoá thành viên: `conversations.service.ts:270-275`, `leaveGroup` từ `:286`.
*Tác động:* người bị kick khỏi nhóm vẫn nhận `new_message`, `message_read`, `user_typing` cho tới khi tự disconnect. Đây là lỗi bảo mật, không chỉ là rác.
*Khắc phục:* `this.io.in(`user:${targetId}`).socketsLeave(`conversation:${id}`)` trong `removeMember`/`leaveGroup`.

**C4. `GET /messages/search` chết — tính năng đang hỏng**
`chat-backend/src/messages/messages-search.controller.ts:15` khai báo `@Controller('messages')` + `@Get('search')`, nhưng `messages.module.ts:21` chỉ đăng ký `[MessagesController, MessagesSyncController]`. Đã grep toàn backend: `MessagesSearchController` **không xuất hiện ở bất kỳ mảng `controllers` nào**. `messages.controller.ts:31` mount ở path khác (`conversations/:conversationId/messages`) nên không phục vụ route này.
Mobile đang gọi thật: `ChatApp/src/services/api/apiService.ts:510` → dùng bởi `useUniversalSearch.ts:109` → `UniversalSearchScreen`.
*Tác động:* tìm kiếm tin nhắn trong Universal Search gần như chắc chắn trả 404.
*Khắc phục:* thêm vào `controllers` array. **Sửa, không xoá.**
*Chưa xác minh:* chưa chạy runtime để thấy 404 thật — kết luận suy ra từ phân tích đăng ký.

**C5. Debounce MMKV bị đảo ngược thành ghi đồng bộ mỗi lần đổi state**
`ChatApp/src/screens/chat/hooks/useMessages.ts:191-210` — đã đọc trực tiếp xác nhận
`messages` nằm trong dep array `:210`, nên mỗi lần state đổi effect bị teardown **trước** khi timer 500ms kịp nổ → nhánh flush `:206-207` chạy, ghi đồng bộ **toàn bộ mảng** lên JS thread. Comment `:186-190` mô tả hành vi gộp write là **không đúng** với dep array hiện tại.
*Tác động:* nặng nhất khi upload media — `updateUploadProgress` (`:603-612`) gọi `setMessages` mỗi tick progress → mỗi tick serialize + ghi cả mảng.
*Khắc phục:* giữ `messages` trong ref, dep chỉ `[conversationId]`, đọc ref trong timer.

**C6. `reload` truy vấn lại toàn bộ cửa sổ mỗi tin nhắn đến**
`ChatApp/src/screens/chat/hooks/useMessagesFromDb.ts:133` trong `reload` (`:130-139`), đăng ký làm callback invalidation tại `:141`.
*Tác động:* sau khi cuộn ngược 500 tin, **mỗi** tin nhắn/read-receipt/reaction đến = 1 query SQLite 500 dòng + 500 object mới + thay cả mảng state. O(window) mỗi message thay vì O(1) delta.

**C7. Context value không memo → mọi consumer re-render**
`ChatApp/src/contexts/AuthContext.tsx:516-535` truyền object literal 16 field, **không `useMemo`**.
*Tác động:* `ConversationListItem.tsx:62` gọi `useAuth()` **bên trong** component đã `React.memo` (`:201`) → `React.memo` vô hiệu hoàn toàn cho cả list. Lan sang `ConversationListScreen`, `UniversalSearchScreen`, `MomentViewerScreen`, `ContactsScreen`.

**C8. Presence event dựng lại mọi object row**
`ChatApp/src/screens/main/ConversationListScreen.tsx:305-316` — `prev.map()` lồng `conv.members.map()`.
*Tác động:* O(conversations × members) + identity mới cho **mọi** row, mỗi lần có người online/offline (liên tục). Phá `React.memo` toàn list.

### HIGH

**H1. 3 primitive overlay chết + 18 modal tự chế**
0 consumer (đã xác minh): `ui/KoolaSheet.tsx`, `ui/KoolaDialog.tsx`, `ui/KoolaMenu.tsx` — 353 LOC + test.
18 implementation thay thế qua 5 pattern: RN `Modal` thô (11 chỗ, gồm `AddMemberModal.tsx:157`, `ForwardModal.tsx:107`, `MusicPicker.tsx:205`), gorhom trực tiếp (`PinListBottomSheet.tsx:32`), View absolute giả modal (`MessageContextMenu.tsx:82`, `GroupCreateModal.tsx:337`), và 1 trường hợp có lý do chính đáng (`VideoPlayerModal.tsx:37-39`, né Fabric Dialog).
Hệ quả phái sinh: ≥6 bản "drag handle" độc lập, ≥7 màu scrim khác nhau, và comment workaround Fabric bị copy-paste 4 lần (`AttachmentSheet.tsx:65`, `ForwardModal.tsx:101`, `ProvincePicker.tsx:77`, `SortMenu.tsx:54`).

**H2. 12 file import tĩnh `koolaColors` → dark mode hỏng im lặng**
`MusicPicker.tsx:22` (26 ref), `GroupCreateModal.tsx:20` (19), `ProvincePicker.tsx:17` (19), `SortMenu.tsx:10` (9), `AttachmentSheet.tsx:11` (8), `ConnectContextBanner.tsx:4` (8), `MomentViewerScreen.tsx:43` (8 — file này **vừa** import `useTheme` vừa import tĩnh), `MentionTextInput.tsx:17` (5), `GroupInfoScreen.tsx:14` (4), `StoryReferenceCard.tsx:18` (4), `CoverPhotoViewerScreen.tsx:23` (2).

**H3. `populate('senderId')` × 12 — công vô ích**
`message.schema.ts:34-35` khai `senderId: String`, grep xác nhận **không có `ref:` nào** trong file (đối chiếu: `conversation.schema.ts:18,58` có `ref: 'User'` đúng chuẩn). Đã xác minh **không ai đọc shape populated**: mobile khai `senderId: string` (`types/index.ts:76`) và dùng làm scalar (`useMessages.ts:25-26`, `:222`); backend cũng không đọc.
Call site: `messages.service.ts:387,463,487,511,523,819,903` + `conversations.service.ts:355,379,401` + `membership.service.ts:25`.
*Thêm:* `conversations.service.ts:443-455` ghi chuỗi `senderId: 'system'` — giá trị không phải ObjectId vào đúng field đang được populate.
*Khắc phục:* xoá hết. An toàn vì không ai tiêu thụ.

**H4. Thiếu index trên query nóng nhất**
`messages.service.ts:383-388` lọc `conversationId` + `deleted` + `deletedFor`; chỉ `{conversationId:1,createdAt:-1}` (`message.schema.ts:138`) dùng được. `deleted` (`:55`) và `deletedFor` (`:68`) **không index** → fetch mọi doc khớp rồi lọc trong RAM. Đề xuất `{conversationId:1, deleted:1, createdAt:-1}`.

**H5. `getConversationList` tải không giới hạn trước khi phân trang**
`chat-backend/src/conversations/conversations.service.ts:340-342` — đã đọc trực tiếp: `.find({userId}).sort({joinedAt:-1})` **không `.limit()`, không `.lean()`, không `.select()`**. Phân trang chỉ áp ở bước sau (`:353-354`). `joinedAt` cũng không có index (`user-conversation.schema.ts` chỉ có `:28-30` và `:32`).
*Lưu ý cân bằng:* `lastMessageAt` và `members.userId` **đã** có index (`conversation.schema.ts:75-77`) — phần sau của hot path này ổn.

**H6. Regex do người dùng nhập → COLLSCAN + ReDoS**
`chat-backend/src/admin/admin.service.ts:207-214` — `new RegExp(dto.search.trim(), 'i')` áp lên 3 field, `countDocuments` tại `:226` chạy lại lần hai.

**H7. N+1 thật trong vòng lặp**
`moments.service.ts:1369-1370`: `for (const storyId of storyIds) { await this.storyModel.findById(storyId) }`.
`moments.service.ts:878-887`: `getHighlightDetail` gọi `assertViewAccess` → `getConnectedUserIds` (1 query Mongo) **mỗi story**.
`notifications.service.ts:64-123`: `await redis.setNXEX` (`:91`) và `await sendMulticast` (`:116`) **tuần tự mỗi recipient** — nhóm 100 người = 100 RTT Redis + 100 lần gọi FCM nối tiếp.

**H8. `ItemSeparatorComponent` inline remount mọi separator**
`ChatApp/src/screens/main/ContactsScreen.tsx:101` — truyền **component type mới** mỗi render → React unmount + remount toàn bộ separator mỗi lần render. Màn này cũng **không có** `initialNumToRender`/`maxToRenderPerBatch`/`windowSize`.
*Đối chiếu:* `ConversationListScreen.tsx:391` làm đúng (memoized `SeparatorComponent`).

**H9. 4 module backend 0 test**
`gateway/` **615 LOC** (chứa chính C3 và lỗi `readBy` bên dưới), `conversations/` 1132 LOC, `notifications/` 390 LOC, `common/` 261 LOC (có Lua script atomic tự viết `redis.service.ts:74-84`).
*Đối chiếu:* `webrtc/` có 8 spec cho độ phức tạp tương đương — dự án biết cách test gateway, chỉ là chưa làm cho `chat.gateway.ts`.

**H10. Danh sách không virtualize**
`GroupCreateModal.tsx:266` (`.map()` trong ScrollView `:374`, có cả nút "Tải thêm" `:308-320` → list chỉ có thể phình to), `AddMemberModal.tsx:218`.

### MEDIUM

**M1. Fabricate read receipt** — `chat.gateway.ts:485`: `(updatedMsg as any)?.readBy ?? [userId]`. Nếu re-read `:484` trả `null` (tin bị xoá giữa 2 query), bịa ra receipt cho tin không tồn tại rồi broadcast.

**M2. MinIO không có abstraction** — `media/minio-client.ts:14` tạo `new Minio.Client` **lúc import module**, credential fallback hardcode `'chatadmin'`/`'changeme123'` (`:18-19`, `:48-49`). Import thẳng vào `messages.service.ts:23` và `moments.service.ts:45` → domain messaging biết chi tiết object storage, và **không unit-test được** 2 service 1000+ LOC nếu không mock. Đối chiếu `PlivoService`/`EmailService` làm đúng: `@Injectable` + `ConfigService` + degrade có cảnh báo.

**M3. Controller emit trực tiếp qua gateway** — `messages.controller.ts:37`, `messages-sync.controller.ts:37` inject `ChatGateway` qua `forwardRef`. Tồn tại song song với pattern đúng (callback ở `conversations.service.ts:539`). Hai cách làm cùng một việc.

**M4. `typingTimers` in-memory** — `messages/typing.service.ts:5`. Gõ ở instance A, dừng ở B → indicator nhấp nháy. Tự lành sau 5s, chỉ là thẩm mỹ.

**M5. `presence_update` thiếu `conversationId`** — `chat.gateway.ts:523-527`, `:541-545`. Client ở N hội thoại nhận N frame giống hệt nhau, không phân biệt được.

**M6. Admin check inline không dùng guard** — `moments.controller.ts:246-249` dùng `res.status(403).json()` còn `:298-300`, `:306-308`, `:320-322` dùng `throw ForbiddenException`. `auth/guards/admin.guard.ts` **đã tồn tại** mà không dùng.

**M7. Cron dọn media trùng** — `media/media-cleanup.service.ts` (không đăng ký ở `media.module.ts:22`) trùng chức năng `media-cron/media-cron.service.ts:11-12`, **cùng cron `0 3 * * *`** nhưng retention khác nhau (24h vs 30 ngày). Hai nguồn sự thật mâu thuẫn về policy.

**M8. 4 bản format thời gian VN không nhất quán** — `formatViTimestamp.ts:15` và `:41` (2 bản ngay trong cùng file, khác nhau cả cách viết hoa `'vừa xong'` vs `'Vừa xong'`), `useChatHeaderState.ts:174-183` (bản thứ 3 tự viết), `date-fns` ở `MessageResultItem.tsx:21` + `ProfileScreen.tsx:165`. `ProfileScreen.tsx:165` và `useChatHeaderState.ts:178` render **cùng một chuỗi presence** bằng 2 engine → chắc chắn lệch nhau.

**M9. `getPreviewText` copy-paste** — `QuoteBubble.tsx:24-27` và `ReplyPreview.tsx:39-42` giống hệt từng dòng; biến thể thứ 3 ở `useMessages.ts:397` dùng nhãn khác (`'📷 Photo'` thay vì `'📷 Hình ảnh'`).

**M10. 5 bản debounce tự chế** — `ContactSearchBar.tsx:17-21`, `useReadReceipts.ts:11`, `UsernameSheet.tsx:24`, `MomentViewerScreen.tsx:82`, `useUniversalSearch.ts:55-58`.

**M11. Type trùng xuyên stack, không có shared package** — Đã xác nhận không có workspaces/shared dir. `Message` 3 định nghĩa (+2 shape DB), `User` 3, `Story` 2, `Conversation` 2, `PinnedMessage` 2 với **lệch kiểu thật**: `pinnedAt: string` (mobile `types/index.ts:156`) vs `Date` (backend `conversation.schema.ts:31`).
*Điểm sáng đối chiếu:* `media-limits` làm đúng — codegen + test cross-check (`chat-backend/src/media/__tests__/limits-cross-check.spec.ts`). Đây là pattern nên nhân rộng.

**M12. `KoolaHeader` đặt sai chỗ** — `components/KoolaHeader.tsx` 462 LOC, tên `Koola*`, export type dùng chung, nhận 9 prop generic, tiêu thụ `useTheme` → là primitive design-system nhưng nằm ngoài `ui/`.

### LOW

**L1. 7 file mobile mồ côi (587 LOC)** — đã xác minh 0 inbound: `SwipeableBubble.tsx` (101), `ReplyPreview.tsx` (92), `QuoteBubble.tsx` (79), `EmptyConversations.tsx` (28), `AuthNavigator.tsx` (28), `PlaceholderScreen.tsx` (39), `ZoomableImage.tsx` (220).
*Đặc biệt `ZoomableImage`:* file rời mồ côi, nhưng bản **đang dùng** là bản inline `ImageViewerScreen.tsx:48` (export `:344`, dùng bởi `CoverPhotoViewerScreen.tsx:18`). Hai component cùng tên, bản phong phú hơn thì không ai gọi.
*Cảnh báo:* 4 file là chat-bubble component trên branch `wip/chat-scroll-*` — **xác nhận ý định trước khi xoá**.

**L2. File backend chết** — `app.controller.ts` (12) + `app.service.ts` (8) scaffold `nest new`, chỉ được tham chiếu bởi spec của chính nó; `common/jwt-shared.module.ts` (17) không ai dùng trong khi `media.module.ts:13-18` khai lại y hệt (và bản chết dùng `getOrThrow` **an toàn hơn** `get`).

**L3. Script chết gây lỗi typecheck** — `chat-backend/scripts/reseed-businesses.ts:14` import `../src/businesses/businesses.service`; đã xác minh thư mục `chat-backend/src/businesses` **không tồn tại**, script không có trong `package.json`.

**L4. `uuid` thừa trong mobile** — `ChatApp/package.json:60`, 0 import site. Đã bị thay bằng `clientId.ts:31` vì lý do Hermes (ghi rõ ở `:4-15`) nhưng chưa gỡ; còn sót entry ở `jest.integration.config.js:9`.

**L5. Token khai báo nhưng không dùng** — `koolaZIndex` (`theme.ts:276`), `koolaDarkShadows` (`:221`), `koolaEasing`/`koolaSprings` (`motion.ts:44,58`). Trong khi `MessageContextMenu.tsx:181-182` hardcode `zIndex: 9999, elevation: 9999`.

**L6. `cn.ts` + prop `className` vô hiệu** — `ui/cn.ts:1-5` là tàn dư NativeWind; `KoolaText.tsx:39`, `KoolaButton.tsx:20`, `KoolaIconButton.tsx:13`, `KoolaSurface.tsx:9` nhận `className` nhưng không có Tailwind config nào đang dùng.

**L7. 48 `console.log` sót** — 37 mobile + 11 backend, nhiều cái có comment "Remove after debugging". Nặng nhất: `useMessages.ts:199,208` nằm ngay trong đường ghi đồng bộ của C5.

**L8. 4 lỗi typecheck backend** — 3 lỗi trong spec + 1 script chết (L3). *Mobile typecheck sạch 0 lỗi.*

**L9. `unique: true` lệch convention** — `user.schema.ts:32` (`phone`), `:44` (`username`) dùng `@Prop({unique:true})` trong khi chính file đó ghi chú ở `:132-133` rằng phải dùng `schema.index()`. **Hiện chưa có duplicate index thật** (đã kiểm: `@Prop({index:true})` xuất hiện 0 lần toàn backend), nhưng là bẫy cho người sửa tiếp theo.

---

## 4. Roadmap refactor ưu tiên theo tác động/chi phí

### Làm ngay (1–2 ngày, tác động cao chi phí thấp)

| # | Việc | Chi phí | Tác động |
|---|---|---|---|
| 1 | Đăng ký `MessagesSearchController` vào `messages.module.ts:21` | 1 dòng | Khôi phục tính năng đang hỏng (C4) |
| 2 | Xoá `callTimeouts` Map, dựa vào cron Redis sẵn có | ~2h | Gỡ blocker scale ngang (C1) |
| 3 | Thay 2 `io.emit()` global bằng emit theo `user:` room | ~2h | Hết O(N) fanout + hết lộ dữ liệu (C2) |
| 4 | Thêm `socketsLeave()` vào `removeMember`/`leaveGroup` | ~2h | Bịt lỗ hổng quyền (C3) |
| 5 | Xoá 12 `.populate('senderId')` | ~1h | Bỏ fan-out vô ích trên mọi hot path (H3) |
| 6 | Sửa dep array `useMessages.ts:210` → dùng ref | ~1h | Hết ghi đồng bộ mỗi tick upload (C5) |
| 7 | `useMemo` cho AuthContext value `:516-535` | ~30ph | Khôi phục `React.memo` toàn app (C7) |
| 8 | Bỏ inline `ItemSeparatorComponent` `ContactsScreen.tsx:101` | ~15ph | Hết remount separator (H8) |
| 9 | Thêm index `{conversationId:1, deleted:1, createdAt:-1}` | ~30ph | Query nóng nhất hết lọc RAM (H4) |
| 10 | Xoá `media-cleanup.service.ts` chết + `reseed-businesses.ts` + `uuid` | ~30ph | Hết mâu thuẫn retention policy (M7, L3, L4) |

### Ngắn hạn (1–3 tuần)

11. **Migrate 18 modal → `KoolaSheet`/`KoolaDialog`/`KoolaMenu`** (H1). Cần thêm variant `BottomSheetModal` và nhúng sẵn Fabric guard vào `KoolaSheet` trước. Đây là hạng mục ROI cao nhất của phần UI.
12. **Thêm ESLint chặn hồi quy**: `no-restricted-imports` cho `Text`/`TouchableOpacity`/`Modal` từ `react-native`, cấm import tĩnh `koolaColors`, cấm hex thô. **Làm cùng lúc với 11**, nếu không 678 con số thô sẽ quay lại.
13. **Sửa 12 file import tĩnh `koolaColors`** → `useTheme()` (H2).
14. **Viết test cho `gateway/` và `conversations/`** (1747 LOC đang 0 test, chứa C3 và M1) — copy pattern từ `webrtc/` đã có 8 spec (H9).
15. **Sửa `reload` thành delta thay vì full-window** `useMessagesFromDb.ts:133` (C6) và presence update tại chỗ `ConversationListScreen.tsx:305-316` (C8).
16. **Gộp 4 bản format thời gian VN** về `formatViTimestamp.ts`, chuẩn hoá trên `date-fns` + locale `vi` (M8) — hiện đang mang dep `date-fns` chỉ cho 2 call site.
17. **Giới hạn + `lean()` cho `getConversationList`** (H5), sửa N+1 ở `moments.service.ts:1369` và `notifications.service.ts:64-123` (H7), bọc regex admin (H6).
18. **Dọn 7 file mồ côi + scaffold backend** (L1, L2) — quyết định trước: `ZoomableImage.tsx` rời (220 LOC, có forwardRef API) nên **thay thế** bản inline hay bị xoá.

### Dài hạn (1–3 tháng)

19. **`StorageService` injectable bọc MinIO** (M2) — mở khoá unit test cho `messages.service.ts` và `moments.service.ts`, gỡ credential hardcode khỏi import scope. Sau đó tới `FcmService`.
20. **Shared contract package cho `Message`/`Story`/`User`/`PinnedMessage`** (M11) theo đúng pattern `media-limits` đã chứng minh hiệu quả (codegen + test cross-check).
21. **Tách 3 god class**: `moments.service.ts` 1469 LOC / 28 method public / 10 dependency → tách theo capability (Story, Highlight, AudienceList, MusicTrack — đã có sẵn 4 spec riêng để làm đường cắt). `messages.service.ts` 1047, `webrtc.gateway.ts` 1042.
22. **Thống nhất 1 cơ chế service↔gateway** thay cho 3 cơ chế hiện tại (callback setter / `OnModuleInit` setter / `forwardRef` trực tiếp) và giảm 9 vòng `forwardRef`. Cân nhắc event emitter nội bộ.
23. **Thêm outbox pattern** cho emit — hiện emit là fire-and-forget `.catch()`, emit lỗi chỉ log, không retry; state đã commit có thể lệch vĩnh viễn với thứ client được báo.

---

## 5. Những chỗ đã làm rất tốt (đừng "sửa")

- **Không có race emit-before-commit ở bất kỳ flow nào** đã trace: `sendMessage` (`messages.service.ts:102-218`), `createStory`, `deleteStory`, `reactToStory`. Kỷ luật thứ tự nhất quán.
- **Đường pin/unpin là emit path tốt nhất codebase**: await write → check `modifiedCount === 0` → mới emit (`conversations.service.ts:526-539`).
- **`CallSessionService`** Redis-native hoàn toàn, tự lành, tránh `KEYS`/`SCAN` (`call-session.service.ts`).
- **`SocketService.ts:12,65-69,122-133`**: registry `Map<string, Set>` miễn nhiễm duplicate handler, tự re-attach khi reconnect. Xác minh 13 `on` / 13 `off` cân bằng tuyệt đối.
- **Join/leave room mobile sạch**: đúng 2 call site, cùng một effect cleanup (`ChatScreen.tsx:421,423`).
- **`media-limits` codegen + cross-check test** — hình mẫu cho mọi contract xuyên stack.
- **`useAccountDiscovery.ts:30-45`**: `buildParams` dùng dep nguyên thuỷ nên object literal của caller không gây refetch loop — bug "trông thấy rõ" đã được xử lý chủ động.
- **Comment giải thích "tại sao"** ở mức hiếm thấy: workaround Fabric, lý do `removeClippedSubviews={false}`, giải thích READ status chỉ áp cho DIRECT.
- **0 TODO/FIXME/HACK** toàn bộ codebase; 51 spec capability đã archive.

---

## 6. Những điều chưa xác minh được

- **Chưa chạy runtime** để xác nhận `/messages/search` thật sự trả 404 — kết luận C4 suy từ phân tích đăng ký module (rất chắc, nhưng không phải quan sát trực tiếp).
- **Chưa đo hiệu năng thực tế**: mọi phát hiện perf suy ra từ đọc code, không có số đo trên máy thật. Theo [[project_chat_scroll_phase2_measurement_protocol]], cần build RELEASE trên thiết bị thật mới có số liệu hợp lệ.
- **7 file mồ côi có thể là work-in-progress**: branch hiện tại là `wip/chat-scroll-phase1-phase2b` và 4/7 file là chat-bubble component.
- **Chưa đọc thân vòng lặp** tại: `webrtc.gateway.ts:128,165,613,702,878,939`; `call-session.service.ts:263,300,339`; `messages.controller.ts:147`.
- **`populate('senderId')` — hành vi runtime chính xác chưa quan sát trực tiếp**: đã xác minh không có `ref`, build-time không throw (test thực nghiệm với mongoose 9.3.3), và không ai đọc shape populated. Nhưng chưa chạy query thật để biết Mongoose no-op hay throw lúc execute.
