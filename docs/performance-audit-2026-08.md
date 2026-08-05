# Báo cáo phân tích hiệu năng APP_KOOLA — 2026-08-03

Phạm vi: backend NestJS, mobile RN 0.76 (render + local SQLite/sync), real-time (Socket.IO + WebRTC), hạ tầng build/observability.
Phương pháp: phân tích tĩnh, mọi phát hiện đã đọc code xác minh. **Không có MongoDB/thiết bị nào chạy được** trong lúc audit, nên các kết luận về index là suy luận từ khai báo schema so với query shape — chưa có `explain()` thật.

> **Cập nhật vòng 2 (trace sâu bằng context engine + GitNexus `impact`).** Vòng 1 xếp severity dựa trên *chi phí mỗi event* mà chưa xác minh *tần suất event* — severity là hàm của cả hai. Vòng 2 đã trace lại các giả định lớn nhất và **sửa 2 kết luận sai**, **nâng 1 mục lên CRITICAL**:
> - **1.3 mark-read: hạ từ CRITICAL → HIGH.** Con số "10.000 event" của vòng 1 sai — đường REST bị coalesce bởi outbox theo `conversationId`, và số event bị chặn bởi `upToTimestamp`. Chi tiết ở 1.3.
> - **2.1 `verifyMember`: nâng từ HIGH → CRITICAL.** `impact` cho risk **CRITICAL**, 20 symbol, 8 execution flow. Vòng 1 gán HIGH mà chưa chạy impact — vi phạm chính quy tắc CLAUDE.md.
> - **Phát hiện mới: hai đường mark-read chạy song song** (socket + REST), gây ghi trùng. Xem 1.4.
> - **1.1 populate: xác nhận an toàn khi bỏ.** Đã trace toàn bộ consumer mobile — chỉ dùng `senderId` như string thuần.
> - **3.1 AuthContext: xác nhận fix sẽ hiệu quả.** Cả 10 hàm trong value đã `useCallback`, nên `useMemo` chỉ còn phụ thuộc 6 state value.

---

## 1. Ba vấn đề vừa là bug đúng-sai, không chỉ là chậm

Đây là nhóm cần xử lý trước, vì chúng gây lỗi người dùng thấy được chứ không chỉ tốn tài nguyên.

### 1.1 `populate('senderId')` trên field không có `ref` — 8 chỗ
`chat-backend/src/messages/message.schema.ts:34` khai báo `senderId` là `String` thuần, **không có `ref: 'User'`** (trong khi `conversation.schema.ts:18` và các schema khác đều khai báo `ref` đúng). Mongoose không biết populate sang model nào nên fallback về model *cục bộ* — tức là query chính collection `messages` với `{_id: {$in: [<userId>]}}`.

Hệ quả: mỗi query có populate đều bắn **thêm một query chắc chắn vô nghĩa**, rồi gán `senderId = null`. 8 call site: `messages.service.ts:387,463,487,511,523,819,903` và `conversations.service.ts:401` — phủ đúng các đường nóng nhất (list message, sync, search, jump, forward, chi tiết hội thoại).

Mobile đang che lỗi này: `ChatApp/src/hooks/useMessageSync.ts:37` đọc `msg.senderId?._id ?? msg.senderId ?? ''`.

**Vòng 2 — đã xác minh bỏ populate là an toàn.** Trace toàn bộ consumer phía mobile qua context engine: `useMessages.ts:25` và `useTargetMessage.ts:18` đều gán `user: { _id: msg.senderId }` — dùng **string thuần**, không đọc `displayName`/`avatar` từ populate. Tên hiển thị resolve từ conversation members (`resolveConversationHeader`, `ConversationListItem.tsx:16-49`), hoàn toàn độc lập với `senderId`. Nên bỏ 8 lệnh populate **không** làm mất dữ liệu UI nào.

**Tác động:** gấp đôi số query trên 2 endpoint đọc nóng nhất. Đang sai ngay hôm nay.

### 1.2 Token-refresh stampede → logout oan
`ChatApp/src/services/api/apiService.ts:49-107`. Cờ `_retry` đặt trên **từng request**, không có singleton `refreshPromise` nào trong file. Khi app foreground với token hết hạn, `syncOrchestrator` + danh sách hội thoại + outbox tick cùng nhận 401, mỗi cái tự POST `/auth/refresh` và cùng ghi đè refresh token (dòng 65).

Với refresh token quay vòng, lần refresh thứ 2 trình token đã bị tiêu thụ → thất bại → dòng 89-102 xoá token và gọi `forceLogoutHandler()`.

**Tác động:** người dùng bị đăng xuất ngẫu nhiên. Cùng họ lỗi với "forced logout loops" mà CLAUDE.md đã đánh dấu high-risk.

### 1.3 Mark-read query lại không giới hạn → HIGH (đã hạ từ CRITICAL)
`chat-backend/src/messages/messages.service.ts:658-666` → `messages.controller.ts:147-155`. Sau `updateMany`, code query lại với `readBy: userId` — đây là **phủ định** của filter update ở dòng 638 (`readBy: {$ne: userId}`), nên nó chọn mọi message user đã đọc *từ trước*, không chỉ những cái vừa update. Không có `.limit()`.

**Vòng 2 — con số của vòng 1 đã sai.** Vòng 1 nói "10.000 event mỗi lần mark-read"; trace thực tế cho thấy nhỏ hơn nhiều vì hai lớp chặn:

1. **`upToTimestamp` giới hạn phạm vi.** Client gửi timestamp (`useMessagesFromDb.ts:445-454`), nên filter `createdAt: {$lte: upTo}` không quét toàn bộ lịch sử — chỉ tới mốc đó.
2. **Outbox coalesce theo hội thoại.** `outboxRepository.ts:255` dùng `dedup_key = conversationId`, và partial unique index gộp về `MAX(upToTimestamp)` khi row còn `pending`/`in_flight`. Nên cuộn qua 50 message chỉ tạo **1** request, không phải 50.

Vấn đề vẫn thật: query trả về **toàn bộ message đã đọc tính đến `upTo`** rồi emit 1 event mỗi cái, trong khi chỉ cần emit cho `modifiedCount` message vừa đổi. Mở lại một hội thoại cũ 2.000 tin đã đọc vẫn emit 2.000 event dù không có gì thay đổi. Nhưng đây là **O(lịch sử tới `upTo`) mỗi lần mở chat**, không phải "bão mỗi tin nhắn" như vòng 1 mô tả — nên HIGH, không phải CRITICAL.

**Sửa đúng gốc:** thu thập `_id` từ chính `updateMany` (hoặc query với `updatedAt: readAt`) thay vì query lại theo `readBy: userId`.

### 1.4 [MỚI — vòng 2] Hai đường mark-read chạy song song, ghi trùng
Trace phát hiện **cả hai** cơ chế đều đang hoạt động cùng lúc trên cùng một màn hình chat:

- **Đường socket:** `ChatScreen.tsx:417` gọi `useReadReceipts(...)` → `useReadReceipts.ts:23` emit socket `mark_read` (debounce 500ms) → `chat.gateway.ts:465-504` `handleMarkRead`.
- **Đường REST:** `useMessagesFromDb.ts:448` enqueue outbox `mark_read` → `outboxProcessor.ts:195-198` → `apiService.markRead` → `messages.controller.ts:120`.

Cả hai cùng ghi `readBy` cho cùng user, cùng hội thoại. Đường socket còn tệ hơn về chi phí: `handleMarkRead` gọi `findById` **hai lần** (dòng 475 và 484) cho mỗi event, cộng `verifyMember` (xem 2.1) — tức mỗi 500ms khi user cuộn là ~3 query + 1 populate toàn member.

Đáng chú ý: `markAsRead` trả về từ `useMessagesFromDb` (dòng 486) **không được `ChatScreen` destructure** (kiểm tra dòng 250-266 — không có trong danh sách). Nên đường REST được kích hoạt từ chỗ khác, còn đường socket là đường chạy mỗi lần cuộn. Cần xác định đường nào là đường chính rồi **bỏ hẳn** đường kia — đây là nợ kiến trúc từ đợt migrate local-first, không phải chỉ là vấn đề hiệu năng.

---

## 2. Backend — vấn đề mở rộng quy mô

| # | Vị trí | Mức | Vấn đề |
|---|--------|-----|--------|
| 2.1 | `conversations/services/membership.service.ts:23-28` | **CRITICAL** | `verifyMember` populate toàn bộ member chỉ để trả về boolean, rồi bỏ dữ liệu đã populate. Nhóm 100 người → fetch 100 user doc để trả lời "user này có trong nhóm?". Bản rẻ `isMember` đã tồn tại ở dòng 49-53 (`.select('members').lean()`) nhưng **không** dùng trên đường nóng.<br><br>**Vòng 2 — `impact` xác nhận CRITICAL** (vòng 1 gán HIGH mà chưa chạy impact): risk **CRITICAL**, 20 symbol bị ảnh hưởng, **8 execution flow**, 2 module. Chuỗi gọi là `membership.verifyMember` ← `messages.service.verifyMember` (wrapper dòng 76-81) ← 9 method ← 10 controller/gateway. Các flow bị ảnh hưởng: `sendMessage`, `handleSendMessage`, `commentOnStory`, `forwardMessage`, `deleteMessage`, `handleMarkRead`, `deleteForMe`, `listMessages`.<br><br>Điểm quan trọng khi sửa: có **2 symbol tên `verifyMember`** — wrapper ở `messages.service.ts:76` (risk MEDIUM, 9 caller trực tiếp) và bản thật ở `membership.service.ts:18` (risk CRITICAL). Sửa ở wrapper thì mọi call site được lợi cùng lúc; sửa ở `membership.service` thì ảnh hưởng cả `Conversations` module. **Không được find-and-replace** — nằm trên đường nóng nhất của toàn hệ thống. |
| 2.2 | `conversations/conversations.service.ts:340-360` | HIGH | Load **tất cả** `UserConversation` của user không limit, sort `joinedAt` mà schema **không có index cho `joinedAt`** → in-memory sort (rủi ro tràn 32MB). `$in` 500 ObjectId chạy 2 lần (find + count). |
| 2.3 | `gateway/chat.gateway.ts:533-553` và `:510-529` | HIGH | Mỗi connect/disconnect = 1 query không giới hạn + O(số hội thoại) publish qua Redis. User trong 300 hội thoại → 300 publish mỗi lần connect **và** 300 mỗi lần disconnect. Mobile flap mạng liên tục. `handlePresenceUpdate` còn thêm 1 DB write mỗi event, không throttle. |
| 2.4 | `moments/moments.service.ts:365-379` | HIGH | Feed filter có `audienceScope` (**không có index**) + `$or` 4 nhánh, sort `{authorId:1, createdAt:1}` trong khi index là `{authorId:1, createdAt:-1}` — sai chiều key thứ 2 nên không dùng được. `.limit(limit*10)`: trang 20 item kéo 200 doc. |
| 2.5 | `moments/moments.service.ts:878-887` | HIGH | N+1 còn sót: story batch-load đúng ở `:870`, nhưng vòng lặp gọi `assertViewAccess` từng story, mà hàm này gọi `getConnectedUserIds` không giới hạn. 50 story × 300 direct chat = 50 query tuần tự. Tập connection giống nhau mọi vòng nhưng tính lại mỗi lần. |
| 2.6 | `messages/messages.service.ts:291-322` | MEDIUM | Blocking CPU trên event loop: `Jimp.read` + `resize` + `encode` blurhash là pure-JS đồng bộ, không worker thread. Ảnh 12MP block loop ~200-600ms — **mọi** request và socket event trên instance đó đứng. Đúng anti-pattern CLAUDE.md đã ghi. |
| 2.7 | `messages/messages.service.ts:102-218` | MEDIUM | Cùng một conversation doc được fetch **4 lần** mỗi lần gửi message: `verifyMember` (:108), `updateLastMessage` (:205), `incrementUnreadCount` (:208), `triggerPushNotifications` (:333). Dòng 205 và 208 độc lập nhưng `await` tuần tự → thêm 1 RTT vào độ trễ gửi mà user cảm nhận. |
| 2.8 | `messages/messages.service.ts:990-1046` | MEDIUM | `$text` search + sort `createdAt` — MongoDB không thể dùng text index cho non-text sort → blocking sort in-memory. `countDocuments` chạy lại đúng text search đó. Không `.lean()`. |
| 2.9 | `notifications/notifications.service.ts:40-124` | MEDIUM | Recipient đã batch-fetch đúng, nhưng vòng lặp `await` **tuần tự** `setNXEX` + `sendMulticast` từng người. Nhóm 100 người = 100 Redis RTT + 100 FCM HTTP call nối tiếp ≈ 5 giây. |
| 2.10 | `moments/moments.service.ts:1362-1408`, `:1306-1360` | MEDIUM | 1+N query + 2N round trip MinIO, hoàn toàn tuần tự. Promote 30 story = 30 lần copyObject nối tiếp. |
| 2.11 | `conversations/conversations.service.ts:114-120` | MEDIUM | `members: {$size: 2}` — `$size` **không indexable**. Thiếu compound `{type:1,'members.userId':1}` nên chỉ 1 index dùng được, phần còn lại thành post-filter. |
| 2.12 | `moments/moments.service.ts:653-691` | MEDIUM | Cron mỗi phút, 4 round trip Redis tuần tự mỗi story dirty. 500 story/phút = 2.000 RTT nối tiếp trên event loop. Thiết kế dirty-set tránh `KEYS` là đúng, nhưng khâu drain không batch. |
| 2.13 | `call-logs/call-logs.service.ts:75-101` | LOW | `$or` 2 nhánh + sort `startedAt` nhưng chỉ có index đơn field, thiếu compound → index scan từng nhánh rồi blocking sort. |
| 2.14 | `users/users.service.ts:428-472`, `admin/admin.service.ts:191-230` | LOW | `$regex` không neo đầu → full scan mỗi lần search. `displayName` không có index. Sẽ thành HIGH khi vượt ~50k user. |

**Đã loại trừ:** `users.service.ts:49` `findAll()` không limit — kiểm tra cho thấy **không có call site nào**, là dead code. Không phải rủi ro.

---

## 3. Mobile — render

| # | Vị trí | Mức | Vấn đề |
|---|--------|-----|--------|
| 3.1 | `contexts/AuthContext.tsx:517` | CRITICAL | `Provider value` là object literal mới mỗi render, **không `useMemo`** (so với `ThemeProvider.tsx:86` có memo đúng). Mọi consumer re-render khi bất kỳ auth state đổi, kể cả cờ `isSwitchingAccount`. `AppInner` (`App.tsx:72`) cũng consume và nằm trên `RootNavigator` → đổi auth state re-render cả cây navigator.<br><br>**Vòng 2 — `impact` xác nhận + fix sẽ hiệu quả thật.** `useAuth` risk **HIGH**, 29 symbol, **27 caller trực tiếp**. Quan trọng hơn: đã kiểm tra cả **10 hàm** trong value (`login`, `registerInit`, `verifyOtp`, `forgotPassword`, `verifyResetOtp`, `resetPassword`, `refreshUser`, `logout`, `switchAccount`, `switchBackToPersonal`) — **tất cả đều đã `useCallback`**. Nên bọc `useMemo` chỉ còn phụ thuộc 6 state value (`user`, `isAuthenticated`, `isLoading`, `accounts`, `activeAccount`, `isSwitchingAccount`), tức fix sẽ loại được gần như toàn bộ re-render thừa — không phải fix nửa vời. |
| 3.2 | `components/ConversationListItem.tsx:62` | CRITICAL | Row đã `React.memo` nhưng gọi `useAuth()` bên trong — context consumption **vượt qua** memo hoàn toàn. Thêm nữa `ConversationListScreen.tsx:351` truyền `onPress={() => ...}` tạo closure mới mỗi render, tự phá memo. Mỗi auth change → toàn bộ row đang mount re-render, mỗi row chạy lại `resolveConversationHeader` (`.find()` qua members). |
| 3.3 | `screens/main/ConversationListScreen.tsx:305-316` | HIGH | `handlePresenceUpdate` **không có** guard `localFirstEnabled` (khác `handleNewMessage` ở dòng 287). Local-first đang BẬT (đã xác nhận trong `dev-config.json` + `.env`), nên mỗi presence event dựng lại toàn bộ array + mọi nested `members`, FlatList thấy identity mới → re-render tất cả row, dù SQLite subscription ghi đè ngay sau đó. Nhân với mục 2.3: fanout là mọi hội thoại dùng chung. |
| 3.4 | `screens/chat/hooks/useMessagesFromDb.ts:130-139` | HIGH | Callback reload query lại SQLite và map **lại toàn bộ** message đã load (`Math.max(50, loadedCountRef.current)`) qua `dbMsgToGifted`, rồi `setMessages` với identity mới hết. Chạy khi *bất kỳ* mutation nào xảy ra — kể cả 1 message đến hay 1 reaction. Đã cuộn 300 message → mỗi tin nhắn đến map lại 300 object. Càng ở lâu trong chat càng jank. |
| 3.5 | `screens/moments/MomentViewerScreen.tsx:151-157` | HIGH | `Animated.timing` với `useNativeDriver: false` chạy `width: '0%'→'100%'` (dùng ở dòng 402). Width phần trăm là layout property, không thể native-drive → animation 5 giây trên JS thread, đúng lúc video decode + fetch nhạc + ghi view đang tranh JS thread. **Sửa:** đổi sang `transform: scaleX` + `useNativeDriver: true`. |
| 3.6 | `components/UserAvatar.tsx:32` | HIGH | Không `React.memo`, lại có `useEffect` riêng mỗi instance có thể đặt `setTimeout` retry 3 giây khi cache miss. Cache lạnh → N avatar cùng gọi `getOrDownload` và mỗi cái giữ 1 timer. Xuất hiện ở mọi list row, call log, search result, moment ring, forward modal. |
| 3.7 | `screens/chat/hooks/useMessagesFromDb.ts:108-110` | MEDIUM | `visibleMessages` gọi `loadFromDb(...)` **trực tiếp trong render body** khi `stateMatchesConversation` false — query SQLite đồng bộ + map đầy đủ ngay trên đường render. Cùng pattern ở `useMessages.ts:104-106`. |
| 3.8 | `screens/shopping/ShoppingHomeScreen.tsx:253,312` | MEDIUM | `renderHeader`/`renderFooter` là hàm thường truyền vào `ListHeaderComponent`/`ListFooterComponent` → identity mới mỗi render → header (có ScrollView ngang lồng trong) và toàn bộ store list **remount** thay vì update. Mất vị trí scroll khi đổi filter. Lỗi y hệt ở `ServicesHomeScreen.tsx:234,267`. |
| 3.9 | 8 file | MEDIUM | `renderItem` inline không có row component memo hoá. Cả codebase chỉ có **2** component dùng `React.memo`. Gồm: `ContactsScreen.tsx:95` (+ `ItemSeparatorComponent={() => ...}` dòng 101), `HighlightsScreen.tsx:246`, `MentionTextInput.tsx:140` (re-render suggestion mỗi keystroke), `AudienceListEditorScreen.tsx:228,357`, `GroupInfoScreen.tsx:179`, `ProvincePicker.tsx:153`, `ForwardModal.tsx:137`. |
| 3.10 | `babel.config.js:1` | MEDIUM | Không có `transform-remove-console`. 157 lệnh `console.*` trong `src/`, trong đó 12 log `[PERF ...]` nằm trên đường nóng — `useMessagesFromDb.ts:83` chạy mỗi lần reload danh sách, tức mỗi tin nhắn đến. |
| 3.11 | `screens/main/CallsScreen.tsx:244` | LOW | `renderItem` đã `useCallback` đúng, nhưng row chạy `formatDuration` + `formatRelativeTimestamp` + `getStatusInfo` inline, không có row component memo. `onRefresh={() => ...}` (dòng 332) tạo closure mới mỗi render. |
| 3.12 | `screens/main/MomentsScreen.tsx:123-165` | LOW | `ownRing` (`.find()`), `otherRings` (`.filter()`), `unviewedCount` (`.filter()` thứ 2) và spread `rings` đều tính trong render body không `useMemo` → `data` prop của FlatList không bao giờ ổn định. N nhỏ nên tác động có hạn. |

**Đã kiểm tra và sạch:** `ThemeProvider` (memo đúng), `TabDockSuppressionContext` (memo, `MainNavigator.tsx:427`), `useUniversalSearch` (debounce 300ms + AbortController), `useTypingIndicator` (throttle 500ms, timer được clear), `useNetworkStatus`, `ChatComposer` (uncontrolled — không churn state theo keystroke), `MediaImage`, heartbeat của `SocketService`. Không có nested VirtualizedList.

---

## 4. Mobile — SQLite local + sync

**Xác minh trước tiên:** WAL **thật sự đang bật** — `services/db/connection.ts:110-112` chạy `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000` ngay sau `open()`, trước khi `runMigrations()` gọi `getDb()`. Timing đúng. Nhưng WAL làm mục 4.2 nặng hơn: mỗi write không batch là một commit riêng.

| # | Vị trí | Mức | Vấn đề |
|---|--------|-----|--------|
| 4.1 | `services/sync/outboxProcessor.ts:300-336` + `outboxRepository.ts:308-356` | CRITICAL | `getDue()` trả **tối đa 1 row mỗi hội thoại** (`LIMIT 1`, dòng 347), tối đa 3 hội thoại. `tick()` xử lý xong **không tự schedule lại** khi còn việc.<br><br>**Vòng 2 — đã trace chính xác cơ chế.** Đã đọc `tick()` đầy đủ: vòng lặp dòng 322-328 xử lý `due` (tối đa 3 row, pacing 50ms giữa các row), rồi `_checkThreshold()`, rồi `finally { _isTicking = false }` — **không có `scheduleTick()` nào khi vẫn còn row `pending`**. `enqueue` (`outboxRepository.ts:285-293`) *có* gọi `scheduleTick()` + `ensurePeriodicInterval()`, nên gửi tin khi online thì mượt. Vấn đề chỉ xuất hiện khi **drain backlog**: lúc đó không còn `enqueue` mới để kick tick, nên chỉ còn interval 30s (`PERIODIC_INTERVAL_MS`, dòng 46) làm động lực.<br><br>Backlog 20 message trong 1 hội thoại = 20 tick × 30s ≈ **10 phút**. Reconnect kick 1 lần (dòng 490), gửi 1 message, rồi rơi về 30s. **Sửa:** gọi `scheduleTick()` ở cuối `tick()` khi `countActive() > 0` → giảm về vài giây. |
| 4.2 | `services/db/outboxRepository.ts:578-586` | HIGH | `incrementMetric()` là `db.execute` UPSERT độc lập không transaction, gọi từ 6 chỗ (enqueue 282, markInFlight 371, markDone 387, markRetryable 435, markDeadLetter 454, watchdogReset 513). Không caller nào bọc state change + counter trong 1 transaction. Gửi 1 message = **6 autocommit = 6 WAL commit** (~5× số fsync cần thiết). |
| 4.3 | `services/db/outboxRepository.ts:540-549` | HIGH | `cascadeDeadLetter` full-scan outbox với **3 `json_extract` mỗi row** — không index nào phục vụ được vì mọi predicate là JSON expression. Lại nằm trong vòng BFS `while (queue.length > 0)` (dòng 533) nên chạy mỗi node. Chi phí O(node × row), mà bảng thì vô hạn (xem 4.4). |
| 4.4 | `services/db/outboxRepository.ts:377-388` | HIGH | Row `done` **không bao giờ bị xoá**. `markDone` chỉ đổi `state='done'`; chỉ có `wipeAll()` (logout) và `deleteRow()` (thủ công) xoá. Không reaper, không VACUUM. `mark_read` chỉ coalesce khi `pending`/`in_flight` (partial unique index `migrations/index.ts:120-122` loại `done`) nên **mỗi lần mở hội thoại thêm 1 row**. ~50 send + ~100 read/ngày ≈ 55k row/năm, mỗi row mang `payload_json`. Đây đúng profile "dùng vài tuần thì chậm". |
| 4.5 | `services/db/connection.ts:73-89` | HIGH | Shim hard-wire `execute()` → `raw.executeSync()` (dòng 74), `transaction()` là BEGIN/COMMIT đồng bộ. Đã đối chiếu `node_modules/@op-engineering/op-sqlite/src/index.ts`: v11 **có** `execute(): Promise` (dòng 115), `executeBatch` (120), `prepareStatement` (134) — không dùng ở đâu cả. Mọi read/write block JS thread. Kèm `busy_timeout=5000` nghĩa là tranh lock có thể treo JS thread tới 5 giây. |
| 4.6 | `services/db/messageRepository.ts:336-339` | HIGH | Transaction wrapper (dòng 324) đúng, nhưng mỗi message có `clientMessageId` lại chạy thêm 1 SELECT trong vòng lặp. Sync page = 100 (`apiService.ts:484`). **Sync 200 message = 1 transaction nhưng ~400 JSI call đồng bộ.** Dùng prepared statement hoặc 1 SELECT `IN (...)` trước vòng lặp là hết N. |
| 4.7 | `services/media/mediaIndexService.ts:88-98` | HIGH | `persistMap()` dựng snapshot **toàn bộ** index rồi `JSON.stringify`, gọi từ `set()` (156), `deleteEntry()` (167), `touch()` (191). Cap 5GB với media ~1MB → ~5000 entry ≈ 750KB JSON, dựng lại mỗi lần download xong. Comment dòng 17-19 nói debounce chặn burst, nhưng `TOUCH_DEBOUNCE_MS` tính **theo key** (`lastWriteTs` dòng 77) còn write là toàn map — cuộn qua 20 ảnh = 20 lần serialize toàn map. Tệ nhất là `evictIfNeeded` (213-234) gọi `deleteEntry` trong vòng lặp (231): evict 1000 file = 1000 lần serialize toàn map, **O(n²) byte ghi**. |
| 4.8 | `services/sync/outboxProcessor.ts:300-311` | MEDIUM | `tick()` guard `_isTicking`/`_isPaused`/`AppState` nhưng **không check kết nối**. NetInfo chỉ dùng để *kích hoạt* tick (417-421), không để chặn. Offline có backlog → mỗi 30s vẫn chạy `watchdogReset` (3 UPDATE + metric), `getDue` (2+ query), rồi axios fail sau tới 15s timeout, rồi `markRetryable` (SELECT + UPDATE + metric) ≈ 8 DB write mỗi 30s vô ích. |
| 4.9 | `services/db/outboxRepository.ts:681-686` | MEDIUM | `getDeadLetterRows` không LIMIT, `ORDER BY updated_at DESC` mà `updated_at` không nằm trong `idx_outbox_due` → temp B-tree sort. Gọi từ `OfflineQueueService.ts:37` và `useDeadLetterActions.ts:33,50`. Trả về mọi dead letter từng có (không bao giờ purge — xem 4.4). |
| 4.10 | `services/db/messageRepository.ts:130-153` + `rowToInput` (83-109) | MEDIUM | `idx_messages_conv_created` phục vụ đúng `conversation_id` + sort. Nhưng `deleted_for NOT LIKE '%"uid"%'` (dòng 134) là leading-wildcard LIKE — không index nào dùng được, SQLite phải string-scan JSON mọi row candidate và walk **nhiều hơn** `limit` entry để đủ. `SELECT *` rồi `rowToInput` chạy **4 `JSON.parse` mỗi row**. Đường reload đọc lại cả window đã lớn (`useMessagesFromDb.ts:133`) trên **mỗi** socket event → sau khi cuộn 500 message là 500×4 = **2000 `JSON.parse` đồng bộ mỗi tin nhắn đến**. |
| 4.11 | `services/db/migrations/index.ts:68-69` | LOW | `idx_messages_conv_updated` là **index chết**. Đã grep mọi `WHERE`/`ORDER BY` trên `messages`: `updated_at` chỉ xuất hiện trong `SET`, chưa bao giờ làm filter/sort key. Chi phí thuần: thêm 1 B-tree phải maintain mỗi INSERT và mỗi UPDATE. |
| 4.12 | `services/db/messageRepository.ts:262` | LOW | `WHERE id = ? OR client_message_id = ?` — OR qua 2 index khác nhau. **Chưa xác minh được** plan thật (cần `EXPLAIN QUERY PLAN` trên thiết bị). Nếu OR-optimization không kích hoạt thì đây là full scan mỗi lần confirm send. |

**Đã kiểm tra và sạch:** WAL/pragma, backoff outbox (exponential + jitter, cap 30s, `MAX_RETRIES=8`), periodic interval tự dừng khi `countActive()==0`, `conversationRepository.list` (khớp `idx_conversations_list`, có LIMIT/OFFSET), axios `timeout: 15000`, `upsertMany` bọc transaction đúng, `invalidationBroadcaster` coalesce theo microtask.

---

## 5. Real-time (Socket.IO + WebRTC)

Phần này do agent chuyên sâu thất bại 2 lần vì lỗi API 500 phía hạ tầng, nên đã tự xác minh trực tiếp. Kết quả có thật nhưng **không đầy đủ** như các mảng khác.

| # | Vị trí | Mức | Vấn đề |
|---|--------|-----|--------|
| 5.1 | `webrtc/webrtc.gateway.ts:68` | HIGH | `private callTimeouts = new Map<string, NodeJS.Timeout>()` — state in-memory trong gateway, vi phạm nguyên tắc stateless của CLAUDE.md. Timer nằm trên instance khởi tạo cuộc gọi, nên **với 2+ instance, instance khác không thể huỷ nó**. Cleanup coverage bản thân thì tốt: `clearCallTimeout` được gọi ở 7 chỗ (142, 510, 624, 743, 808, 856, 922) phủ decline/end/cancel/accept/failed/disconnect. Cron 15s tồn tại chính là lưới an toàn cho hạn chế này. |
| 5.2 | `webrtc/webrtc.gateway.ts:689-712` | HIGH | `handleIceCandidate` chạy `validateParticipant` + `getParticipants` = **2 lệnh Redis mỗi ICE candidate**, rồi emit vòng lặp từng participant. ICE flood là hàng chục candidate trong vài giây đầu mỗi cuộc gọi → hàng chục round trip Redis đúng lúc cuộc gọi đang cần thiết lập nhanh nhất. |
| 5.3 | `moments/moments.gateway.ts:60,94` | HIGH | `this.io.emit('story.new')` và `io.emit('story.deleted')` — **global emit, CLAUDE.md cấm rõ ràng**. Có comment giải thích là chủ ý cho story PUBLIC, nhưng vẫn fanout tới *mọi* client đang online, nhân qua Redis adapter tới mọi instance. Nhánh CONNECTIONS/CUSTOM (dòng 66-71) làm đúng: emit theo `user:` room. |
| 5.4 | `services/socket/SocketService.ts:171-174` | MEDIUM | Reconnect có exponential backoff và cap đúng, nhưng **không có jitter** (`Math.random` không xuất hiện trong tính delay; so với `outboxRepository.ts:420` thì có jitter). Sau deploy, N client cùng mất kết nối sẽ cùng thức dậy ở đúng 1s, 2s, 4s… — thundering herd. |
| 5.5 | `webrtc/webrtc.gateway.ts:119-176` | MEDIUM | `handleDisconnect` chạy vòng lặp `await` tuần tự mỗi session: `getSession` → `fetchSockets` → `endSession` → `findBySessionId` → `updateLog` → `getParticipants` → emit. ~6 round trip nối tiếp mỗi session, mỗi lần socket disconnect. |

---

## 6. Hạ tầng & cấu hình

| # | Vị trí | Mức | Vấn đề |
|---|--------|-----|--------|
| 6.1 | Toàn bộ 4 package.json | HIGH | **Không có công cụ observability hay load-test nào.** Không `prom-client`, `@opentelemetry/api`, `dd-trace`, Sentry, `pino`/`winston`; không `k6`/`artillery`/`autocannon`. Nghĩa là mọi con số trong báo cáo này là suy luận tĩnh và **không thể xác nhận bằng đo lường** — cũng không có cách phát hiện hồi quy hiệu năng trong production. |
| 6.2 | `app.module.ts:34-45` | HIGH | `ThrottlerModule` dùng in-memory storage (không cấu hình `storage:`). Rate limit đếm riêng từng instance → với N instance giới hạn thực tế thành N×60/phút, vừa sai vừa phình RAM. Redis đã có sẵn trong project. |
| 6.3 | 6 cron job, không job nào có distributed lock | HIGH | `media-cleanup.service.ts:20`, `media-cron.service.ts:11`, `moments.service.ts:653` + `:1429`, `call-session-cron.service.ts:17`. Với nhiều instance, **tất cả cùng chạy**. Nặng nhất: cron call-session chạy **mỗi 15 giây**, và `cleanupStaleSessions` (`call-session.service.ts:292-321`) đọc-rồi-ghi **không nguyên tử** → 2 instance có thể cùng xử lý 1 session và emit `call_missed` trùng. Vòng lặp bên trong cũng `await` tuần tự từng session. |
| 6.4 | `common/interceptors/logging.interceptor.ts:20` | MEDIUM | `console.log` mọi request, không gate theo env. `console.log` trong Node là **đồng bộ khi ghi ra file/pipe** — mỗi request trả một lần block event loop trong production. |
| 6.5 | `app.module.ts:30` | MEDIUM | `MongooseModule.forRoot` chỉ truyền URI: không `maxPoolSize`, không `autoIndex: false`. `autoIndex` mặc định **bật**, nên production sẽ cố build index khi khởi động. Pool size mặc định (100) chưa chắc phù hợp. |
| 6.6 | Backend không có `compression` | MEDIUM | Response JSON (danh sách hội thoại, feed, sync page 100 message) truyền **không nén** qua mạng di động. |
| 6.7 | `ChatApp/android/app/build.gradle:61` | MEDIUM | `enableProguardInReleaseBuilds = false` → APK release không minify/shrink. Tăng dung lượng tải và thời gian cài. |

---

## 7. Thứ tự xử lý đề xuất

Xếp theo tỉ lệ *giá trị / công sức*, không theo severity thuần.

**Đợt 1 — sửa nhanh, giá trị cao (mỗi mục vài dòng code):**
1. **`verifyMember` → dùng `isMember` có sẵn (2.1)** — đã nâng lên đầu danh sách sau khi `impact` cho **CRITICAL / 8 execution flow**. Sửa ở wrapper `messages.service.ts:76-81` để mọi call site được lợi cùng lúc. Nằm trên đường nóng nhất → cần test kỹ, không find-and-replace.
2. Bỏ 8 lệnh `populate('senderId')` hoặc thêm `ref: 'User'` vào schema (1.1) — đã xác minh mobile chỉ dùng string thuần nên **an toàn tuyệt đối**; cắt một nửa query trên 2 đường nóng nhất.
3. Thêm singleton `refreshPromise` vào `apiService` (1.2) — hết logout oan.
4. `useMemo` cho `AuthContext` provider value (3.1) — đã xác minh 10/10 hàm đã `useCallback` nên fix này ăn trọn hiệu quả.
5. Gọi `scheduleTick()` cuối `tick()` khi `countActive() > 0` (4.1) — outbox drain từ ~10 phút xuống vài giây.
6. Thêm guard `localFirstEnabled` cho `handlePresenceUpdate` (3.3).
7. Thêm jitter vào backoff reconnect (5.4) — một dòng.
8. Sửa filter query lại của mark-read để chỉ lấy message vừa đổi (1.3).

**Đợt 2 — cần thiết kế nhẹ:**
9. **Quyết định một đường mark-read duy nhất rồi bỏ đường kia (1.4)** — nợ kiến trúc từ đợt migrate local-first, đang ghi trùng. Cần quyết định trước khi tối ưu thêm quanh khu vực này.
10. Reaper cho row `done` trong outbox + purge dead letter (4.4, 4.9).
11. Batch `incrementMetric` vào transaction của state change (4.2).
12. Bỏ `useAuth()` khỏi `ConversationListItem`, truyền qua prop (3.2).
13. Chuyển progress bar Moments sang `scaleX` + native driver (3.5).
14. Chuyển blurhash sang worker thread (2.6).
15. Redis storage cho ThrottlerModule (6.2) + distributed lock cho cron (6.3).
16. Thêm index `joinedAt`, `audienceScope`, và sửa chiều sort feed Moments (2.2, 2.4).

**Đợt 3 — nền tảng, nên làm trước khi tối ưu sâu thêm:**
16. **Thêm observability** (6.1). Không có nó, mọi tối ưu ở trên là đoán. Đề xuất tối thiểu: `prom-client` cho backend + một script `autocannon`/`k6` cho 3 endpoint nóng.
17. Chuyển sang API async của op-sqlite (4.5) — thay đổi rộng, nên làm sau khi có đo lường.
18. `transform-remove-console` cho production (3.10), `compression` (6.6), `autoIndex: false` + pool size (6.5), ProGuard (6.7).

---

## 8. Giới hạn của báo cáo này

- **Không chạy được MongoDB** (`ECONNREFUSED 127.0.0.1:27017`), không Docker, không `mongodb-memory-server`. Mọi kết luận về index (2.2, 2.4, 2.8, 2.11, 2.13, 2.14) suy luận từ khai báo schema so với query shape — khai báo thì rõ ràng, nhưng **plan MongoDB thực sự chọn thì chưa được chứng minh**.
- **Không đo trên thiết bị.** Các con số mobile là suy luận từ code, không phải profile thật.
- Mục 4.12 (`OR` qua 2 index) cần `EXPLAIN QUERY PLAN` trên thiết bị mới kết luận được.
- Riêng mục 1.1 đã xác minh **bằng thực nghiệm** — instrument `Query.prototype.exec` của Mongoose 9.3.3 với schema thật, quan sát được query rác và `senderId = null`.
- **Chưa đọc:** `auth.service.ts` (553 dòng), `call-notifications.service.ts`, `typing.service.ts`, `redis.service.ts`, phần lớn controller. Mảng real-time bị cắt ngắn do lỗi hạ tầng API nên nông hơn 4 mảng còn lại — `webrtc.gateway.ts` (1042 dòng, CLAUDE.md xếp high-risk) có thể còn phát hiện khác.

### Bài học phương pháp từ vòng 2

Vòng 1 mắc một lỗi lập luận hệ thống đáng ghi lại: **xếp severity theo chi phí mỗi event mà không xác minh tần suất event**. Severity là tích của hai đại lượng đó. Cụ thể:

- Mục 1.3 bị **thổi phồng** vì tôi tính chi phí mỗi lần gọi (query không limit) mà không kiểm tra client gọi bao nhiêu lần — outbox coalesce theo `conversationId` và `upToTimestamp` chặn phạm vi, nên con số thật nhỏ hơn nhiều lần.
- Mục 2.1 bị **đánh giá thấp** vì tôi đếm call site bằng grep (12 chỗ) thay vì chạy `impact` — knowledge graph cho thấy 20 symbol và 8 execution flow, risk CRITICAL.
- Mục 1.4 (hai đường mark-read song song) **hoàn toàn bị bỏ sót** vì grep tìm được từng đường riêng lẻ nhưng không cho thấy chúng cùng chạy. Chỉ khi trace luồng end-to-end qua context engine mới lộ ra.

Kết luận: `grep` trả lời "chỗ nào có chuỗi này", `impact`/`context` trả lời "thay đổi này phá gì" và "luồng thực tế đi qua đâu". Với audit hiệu năng, câu hỏi thứ hai mới là câu hỏi đúng. Quy tắc CLAUDE.md yêu cầu chạy `impact` trước khi sửa symbol không chỉ để tránh làm vỡ code — nó còn là công cụ xếp hạng ưu tiên chính xác.
