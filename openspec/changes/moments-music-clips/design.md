# Design

## Context

Measured from the current tree, not assumed:

| Sự thật | Nơi đo |
|---|---|
| `musicRef` chỉ có `{trackId, startMs}`, không có độ dài | `story.schema.ts:79-88`, `create-story.dto.ts:36-44`, `momentsApi.ts:22` |
| `startMs` chỉ `@Min(0)`, không `@Max` | `create-story.dto.ts:43` |
| Player nhạc story đặt `repeat` → lặp vô hạn dưới media | `MomentViewerScreen.tsx:648` |
| Story ảnh chạy 5s | `MomentViewerScreen.tsx:57` `IMAGE_DURATION_MS = 5000` |
| Video story bị `muted={!!musicRef}` khi có nhạc | `MomentViewerScreen.tsx:614` |
| Slider picker chặn `durationSeconds - 15` | `MusicPicker.tsx:305` |
| Post **không có** `musicRef`; composer không có mục nhạc | `post.schema.ts`, `PostComposerScreen.tsx` (grep "music" = 0) |
| `usageCount` chỉ tăng khi tạo story | `moments.service.ts:263` |
| Nhạc story đi qua `getOrDownload(previewKey)` → `/media/download/:key` | `MomentViewerScreen.tsx:147` |
| Route đó 404 khi không có `Media` row | `media.service.ts:241` |
| Picker dùng `$text` và trả `nextCursor: null` cứng | `moments.service.ts:1191, 1232` |
| 10 track seed ghi DB nhưng không upload object | `seed-music-tracks.ts:27` |
| Tab Shorts là placeholder | `ShortsScreen.tsx` — `KoolaState` "Tính năng đang được phát triển" |

## Goals / Non-Goals

**Goals:** một đoạn nhạc có biên rõ (10s story / 28s post), người dùng tự chọn đoạn bằng cách trượt trên cả bài, phát đúng đoạn rồi nhường lại tiếng gốc của clip, post gắn được nhạc.

**Non-Goals:** cắt file, tạo preview riêng, thêm `ffmpeg`, làm Shorts thật, waveform.

## Decisions

### D1. `lengthMs` là luật phát, không phải file

`musicRef = { trackId, startMs, lengthMs }`. Không sinh object thứ hai trong MinIO, không job nền, không binary. Story 41s + đoạn 10s = phát 10s rồi thôi; phần còn lại của clip chạy tiếng gốc. Đây chính là điều review mô tả ("clip 14s thì phát 10s, 4s còn lại phát gốc").

Hệ quả bắt buộc: **bỏ `repeat`**. Với `repeat`, âm thanh không bao giờ có "phần còn lại" để nhường.

### D2. Biên theo bề mặt, chặn ở server

| Bề mặt | `lengthMs` tối đa | Hằng số |
|---|---|---|
| Story (nhật ký) | 10000 | `MUSIC_SEGMENT_MAX_MS.STORY` |
| Post / clip | 28000 | `MUSIC_SEGMENT_MAX_MS.POST` |

DTO dùng `@Max` theo từng DTO; service kiểm thêm `startMs + lengthMs <= track.durationMs + TOLERANCE_MS` (tolerance 500ms cho làm tròn mili giây giữa client và metadata) → 400 `"Đoạn nhạc vượt quá độ dài bài"`. Lý do kiểm ở service chứ không chỉ DTO: `durationMs` là dữ liệu server đọc từ file, client không biết chính xác.

Từ chối thay vì kẹp (clamp): một segment bị kẹp âm thầm tạo ra trải nghiệm "tôi chọn 10s mà nghe 6s" không giải thích được. 400 bắt client sửa slider.

### D3. Tương thích ngược: `lengthMs` thiếu → điền theo bề mặt

`musicRef` cũ trong DB không có `lengthMs`. Read path điền `10000` cho story. Không migration, không script backfill: một field thiếu trong một subdocument không đáng một lần chạm toàn collection, và giá trị mặc định đúng với mọi story đã tồn tại (trước đây chúng lặp vô hạn, giờ chạy 10s — không story nào mất nhạc).

### D4. Story ảnh 10s

`IMAGE_DURATION_MS` 5000 → 10000. Với trần 10s, story ảnh 5s sẽ cắt nửa đoạn người dùng vừa chọn — người dùng thấy rõ là lỗi. Đây là hằng số duy nhất phải đổi và nó khớp đúng con số trong yêu cầu.

Story video **không** đổi thời lượng (theo độ dài video gốc), chỉ đổi điểm dừng của nhạc.

### D5. Tiếng gốc quay lại sau khi đoạn nhạc hết

Video story hiện `muted={!!musicRef}` — tắt tiếng suốt clip. Yêu cầu mới cần tiếng gốc ở phần đuôi, nên:

- `t < startMs + lengthMs`: media muted, audio phát.
- `t >= startMs + lengthMs`: dừng audio, `muted = false`.

Cần một state `musicSegmentEnded` do player audio báo về (dùng `onProgress`/timer thay vì `onEnd`, vì track dài hơn đoạn). Đặt trong `MomentViewerScreen` cạnh `isPaused`, reset khi đổi story.

Với story ảnh không có tiếng gốc — dừng audio, phần còn lại im lặng, không có gì để unmute.

### D6. Picker: trượt trên cả bài, xem trước đúng đoạn

Slider: `minimumValue=0`, `maximumValue=max(0, durationSeconds - lengthSeconds)`, `step=1`. Bỏ hoàn toàn `- 15`.

Hiển thị cạnh slider: `"Đoạn 0:12 – 0:22 (10s)"` để người dùng thấy biên. Preview phát từ `startMs` và **tự dừng** ở `startMs + lengthMs` (timer, không phải `onEnd`).

Với post, `lengthSeconds = 28`; story `10`. Truyền qua prop `maxSegmentMs` để picker không hardcode bề mặt.

Giới hạn còn lại phải ghi rõ trong code: **không có waveform**, nên người dùng chọn đoạn bằng thời gian chứ bằng hình. Đó là trần của change này; waveform là change khác nếu cần.

### D7. Nhạc catalog được cache trên máy, khoá theo `trackId`

Hiện trạng: `getOrDownload(musicKey)` gọi `/media/download/:key`, route đó mở đầu bằng `mediaModel.findOne({ mediaKey })` và 404 khi không có `Media` row — đúng trạng thái của nhạc catalog (`music-catalog-ops` D3b không ghi `Media` row). Nên nhánh cache hiện tại **luôn thất bại** và mỗi lần xem lại tải cả file.

Quyết định: **cache lại**, nhưng khoá index theo `music:<trackId>` chứ không theo URL.

Lý do khoá phải là `trackId`, không phải `audioUrl`: presigned URL chứa `?X-Amz-Signature=…` và hết hạn sau 1 giờ. Dùng URL làm key thì lần ký sau tạo key khác → tải lại dù file đã nằm trên đĩa, và entry cũ giữ một URL đã chết. `audioKey` cũng dùng được và ổn định hơn, nhưng `trackId` rõ nghĩa hơn khi debug (`music:695f…`).

Cài đặt: một hàm mới trong `mediaCacheService` tái dùng nguyên đường tải đã có (semaphore 3, retry backoff, LRU, phân loại `audio` cho màn Dung lượng):

```ts
export async function cacheFromUrl(stableKey: string, url: string): Promise<string | null>
```

`getOrDownload` giữ nguyên hành vi cũ; nhạc đi qua `cacheFromUrl('music:' + trackId, trackInfo.audioUrl)`.

Vì sao cache ở đây là **đúng** chứ không phải tối ưu sớm: file nhạc là **immutable** — thay audio của một track nằm ngoài phạm vi mọi change hiện có, nên nội dung sau một key không bao giờ đổi. Đó là điều kiện khiến cache an toàn tuyệt đối (không cần revalidate, không sợ stale). Ngược lại, media tin nhắn cũng immutable nên đã dùng cùng cơ chế từ trước.

Chi phí tiết kiệm: một lần xem story hiện tại = 1 presign + tải cả file. Có cache = lần đầu 1 presign + 1 tải, các lần sau **0 request**. Với story được xem nhiều lần (highlight, xem lại), đây là phần lớn lưu lượng.

Chung bucket LRU với media tin nhắn, **không pin riêng**: nhạc vài trăm KB/bài, trần mặc định 5 GB, gần như không bao giờ bị đuổi; nếu bị đuổi thì chỉ tải lại một lần. Thêm cơ chế pin là phức tạp không đáng.

`musicKey` vẫn trả về (không phá contract) nhưng client không gọi `getOrDownload(musicKey)` nữa — đường đó vẫn 404.

### D7b. Điều cache **không** giải quyết, và cái bẫy phải tránh

Cache trên máy giảm tải **phía thiết bị và băng thông**, không giảm tải MinIO cho người xem lần đầu. Muốn giảm cả lần đầu thì cần CDN/edge cache — hạ tầng mới, ngoài phạm vi change này.

Cái bẫy: đặt `Cache-Control` lên presigned URL sẽ **hỏng chữ ký SigV4** nếu header không được ký cùng. `presignedGetObject` của minio-js chỉ ký `response-content-*`, không ký `cache-control` tuỳ ý; thêm header lạ vào lúc fetch sẽ khiến MinIO trả 403. Vì vậy **không đặt header cache qua HTTP** — cache nằm ở tầng file của app, không phụ thuộc header. Không ai được "tối ưu" bằng cách chèn `Cache-Control` vào request tải nhạc.

### D8. `usageCount` cho post

Post tạo với `musicRef` tăng `usageCount` như story (`moments.service.ts:263` cùng shape, fire-and-forget). Không làm thì "thịnh hành" bỏ qua toàn bộ nhạc dùng trong post — tức là bề mặt được yêu cầu thêm lại không đóng góp vào thứ hạng.

## Risks / Trade-offs

- **Story dài mà nhạc chỉ 10s** → phần còn lại chạy tiếng gốc. Đó là yêu cầu, nhưng người dùng có thể thấy "nhạc tắt giữa chừng". Giảm thiểu: picker hiển thị rõ `(10s)` và khoảng thời gian, không để người ta tưởng là cả bài.
- **`muted` chuyển trạng thái giữa clip** → có thể nghe "cụt" nếu video gốc to. Không xử lý crossfade ở change này; ghi nhận.
- **Không waveform** → chọn đoạn bằng số, không bằng mắt. Trần đã nêu ở D6.
- **`lengthMs` thiếu trong dữ liệu cũ** → điền mặc định ở read path; nếu sau này đổi trần story thì story cũ vẫn giữ 10s đã lưu. Chấp nhận: giá trị đã lưu là sự thật của bản ghi đó.
- **10 track seed không có object trong MinIO** (thuộc `music-catalog-ops`) → change này không sửa được; trước khi test phải upload file hoặc tạo track mới qua admin.
- **Tiếng gốc và tiếng nhạc cùng phát** nếu logic stop sai một nhịp → test bằng video 20s + nhạc 10s, đếm mốc chuyển tiếng.

## Migration Plan

Không migration. Deploy: backend (field + validate) → mobile (picker/player). Mobile cũ gửi `musicRef` không có `lengthMs` vẫn chấp nhận được (điền mặc định), nên không cần ép phiên bản.

## Open Questions

- Có nên cho phép `lengthMs = 0` nghĩa là "không nhạc"? Không — bỏ nhạc bằng `musicRef: null`, giữ một cách biểu diễn duy nhất.
- Story ảnh 10s có cần đồng bộ với cấu hình từ xa không? Chưa; hằng số trong code là đủ và dễ đổi.
