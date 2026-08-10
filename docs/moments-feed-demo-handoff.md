# Moments Feed — Demo Handoff

> **Trạng thái:** Demo dựng xong, chạy được, **chưa commit**. Chưa chốt plan, chưa sửa `MomentsScreen.tsx` thật.
> **Ngày:** 2026-08-09 · **Việc tiếp:** xem demo → chốt format → viết OpenSpec proposal Phase A.

---

## 1. Mở demo thế nào

1. Metro: `cd ChatApp && npx react-native start` (nếu chưa chạy)
2. Trong app: **Settings → `[DEV] Moments Feed Lab`** (chỉ hiện khi `__DEV__`)
3. **Không cần build lại APK** — toàn bộ là JS, chỉ cần reload Metro (`R` `R`)

Lần verify cuối: bundle compile OK (HTTP 200, 17.7 MB).

> Tôi không chụp được screenshot để kèm vào đây — cả emulator lẫn máy thật đều trả file ảnh có dung lượng thật nhưng render trắng ở phía tôi. Giới hạn phía tôi, không phải app lỗi. Thay vào đó tôi verify bằng test hình học (mục 4).

---

## 2. File đã tạo / sửa

### Mới — 3 component thật, dùng lại được khi chốt plan

| File | Dòng | Vai trò |
|---|---|---|
| `ChatApp/src/components/moments/PostCard.tsx` | 489 | Card bài viết: header + caption clamp + media + counts + action bar + preview comment |
| `ChatApp/src/components/moments/PostMediaGrid.tsx` | 298 | Collage 1/2/3/4+ ảnh, badge video + "+N" |
| `ChatApp/src/components/moments/MomentsFeedHeader.tsx` | 220 | Composer prompt + 3 quick action + ring rail full-bleed |

### Mới — chỉ để demo, bỏ đi khi làm thật

| File | Dòng | Ghi chú |
|---|---|---|
| `ChatApp/src/screens/dev/MomentsFeedLabScreen.tsx` | 279 | Lab screen + mock data, `__DEV__` only |
| `ChatApp/src/components/moments/__tests__/PostMediaGrid.spec.tsx` | 149 | Test hình học collage — **giữ lại**, không phải file rác |

### Sửa — chỉ để wire lab screen vào nav (3 file, đều nhỏ)

- `navigation/types.ts` — thêm `MomentsFeedLab: undefined`
- `navigation/ChatTabStack.tsx` — thêm `Stack.Screen` cho lab, bọc `__DEV__`
  - kèm 1 dòng dọn dẹp: bỏ `eslint-disable-next-line @typescript-eslint/no-var-requires` ở screen `OutboxDevPanel` (rule không còn cần, lint đã sạch không cần disable)
- `screens/main/SettingsScreen.tsx` — thêm `KoolaListItem` mở lab

`PostMediaGrid` nhận **cả** `mediaKey` (qua MinIO cache) **và** `uri` (mock) — khi có backend chỉ đổi field, không phải viết lại.

---

## 3. Cần bạn nhìn gì khi mở

- **5 post mẫu** phủ hết case: 2 ảnh · text-only (không media) · 5 ảnh (2x2 + "+1") · 1 ảnh dọc · 1 video badge 0:47
- **Caption dài** ở post 3 → clamp 6 dòng + "Xem thêm" (chỉ hiện khi text thật sự bị cắt)
- **Nhấn "Thích"** → đổi màu + số đếm nhảy (optimistic, local, chưa nối API)
- **Ring rail full-bleed** — bỏ card `raised` bo góc hiện tại, feed đọc thành một dải liền
- **1.264 → "1,3K"** — rút gọn số kiểu Việt (dấu phẩy)
- **Dark mode** — đổi theme, toàn bộ theo token

---

## 4. Đã verify

| Hạng mục | Kết quả |
|---|---|
| `npm run tsc` | **0 lỗi** từ code của tôi |
| `npm run lint` | **sạch** trên cả 4 file mới |
| `PostMediaGrid.spec.tsx` | **30/30 pass** |
| Toàn bộ moments (6 suite) | **76/76 pass**, không phá test cũ |

**Về lint:** `src/components/moments/` là vùng ratchet **error** cho hex literal → phải bỏ toàn bộ hex sang palette token (quick-action tint dùng `accent`/`primary`/`warm`; reaction chip dùng `action.primary`/`status.danger`). Chỉ giữ static với màu chữ/scrim **nằm trên ảnh tối** — dùng token surface sẽ đảo màu và mất chữ ở dark mode.

**Về test collage** (thứ tôi dùng thay screenshot): kiểm trên 4 bề rộng máy (343 / 359 / 411 / 280 px), khẳng định:
- mỗi hàng cộng lại **đúng bằng** width → không hở seam do `floor()` lẻ pixel
- cột phải của layout 3-ảnh cao **đúng bằng** ảnh hero
- không tile nào ra kích thước ≤ 0, với 1/2/3/4/5/9 ảnh
- badge "+N" không hiện ở đúng 4 ảnh, và không bao giờ render 4 tile cho post ≥ 5 ảnh

---

## 5. ⚠️ Có tiến trình khác đang sửa cùng cây code — đọc trước khi chạy test

Trong lúc tôi làm demo, các file sau bị đổi bởi refactor khác (tách upload progress khỏi `MediaImage`):

```
M  ChatApp/src/components/MediaImage.tsx
M  ChatApp/src/hooks/useOfflineQueue.ts
M  ChatApp/src/screens/chat/ChatScreen.tsx
M  ChatApp/src/screens/chat/components/messageItemEquality.ts
M  ChatApp/src/screens/chat/hooks/useMediaUpload.ts
M  ChatApp/src/screens/chat/hooks/useMessagesFromDb.ts
?? ChatApp/src/screens/chat/hooks/uploadProgressStore.ts
?? openspec/changes/chat-screen-render-isolation/
```

**Hệ quả — nếu bạn chạy test/tsc mà thấy đỏ thì KHÔNG phải do demo này:**

- `npm run tsc` báo **3 lỗi ở `ChatScreen.tsx`** — `isUploading` / `uploadProgress` đã bị xoá khỏi `MediaImage` nhưng `ChatScreen` chưa cập nhật theo
- `npm test` báo **2 fail ở `messageItemEquality.spec.ts`** — spec này test chính file `messageItemEquality.ts` đang bị sửa
- Tổng: **932 pass / 2 fail / 1 skipped** (935 test, 58/59 suite pass)

Tôi đã kiểm bằng cách stash riêng phần đó ra: **cả 5 lỗi đều không thuộc công việc của tôi**, và tôi đã restore nguyên trạng công việc của họ. Từ đó tôi **không chạm vào git** nữa trong cây code đang có người khác sửa.

**Vì vậy tôi chưa commit gì cả.** Commit lúc này sẽ trộn file của tôi với refactor đang dở của họ. Khi bạn về, tự quyết: tách branch riêng, hoặc `git add` đúng 7 file của tôi (4 mới + 3 nav/settings ở mục 2).

---

## 6. Việc còn lại

### Blocker thật cho Phase A: `resolveMomentsView`

Hàm này hiện **chỉ xét `ringsLength`** → có ring mà chưa có post sẽ trả `'content'` và vùng feed trắng trơn. Lab screen chưa chạm vào nó (dùng mock non-empty), nhưng bản thật **bắt buộc** phải:

- tách resolver để xét cả posts, không chỉ rings
- sửa `ChatApp/src/screens/main/__tests__/momentsView.spec.ts` theo

### Câu hỏi đang chờ bạn chốt

1. Tỉ lệ collage — giữ như demo hay đổi?
2. Độ dày divider giữa các post?
3. Giữ 3 quick action ở header, hay bỏ/đổi?
4. Comment preview 1 dòng hay 2 dòng?

Chốt xong → tôi viết OpenSpec proposal cho Phase A (đặt dưới `openspec/changes/`, theo pattern `uiux-modernization-roadmap` đã có: `proposal.md` + `design.md` + `tasks.md` + `specs/`).

Ghi chú liên quan: capability `moments-stories` trong `uiux-modernization-roadmap` đã khai báo sẵn phạm vi "Moments entry/ring polish" và non-goal "no API/service/data-model changes for UI polish" — Phase A nên nằm gọn trong đó, hoặc nếu cần đổi data model cho posts thì phải nêu rõ là mở rộng ngoài non-goal.
