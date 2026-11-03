# Đề xuất hoàn thiện thư viện nhạc Koola

**Người lập:** Evan · **Ngày:** 02/11/2026 · **Trạng thái:** chờ duyệt
**Liên quan:** trang `/music` (admin), kho dữ liệu nhạc, Moments (story + post), app mobile

---

## 1. Tóm tắt

Thư viện nhạc hiện là **tính năng nửa vời**: có picker trên app, có trang admin, nhưng kho chỉ có 10 bài nhập tay, chưa bài nào từng được dùng, và không có đường nào để kho lớn lên. Đề xuất này chia việc thành 4 pha để đi từ "10 bài gõ tay" tới "kho nhạc tự lớn, có kiểm soát bản quyền", trong đó **pha 0 nằm trong phạm vi của tôi**, ba pha còn lại cần backend/mobile.

---

## 2. Hiện trạng (số đo, không phải cảm nhận)

| Chỉ số | Giá trị | Hệ quả |
|---|---|---|
| Track trong catalog | **10** | Không đủ để gọi là thư viện |
| Cách thêm track | Gõ tay MinIO key vào form | Sai 1 ký tự → track "câm", vẫn nằm trong DB |
| Giấy phép | 4 CC0 + 6 CC-BY | Có field pháp lý nhưng không có công cụ đối soát |
| Lượt dùng | **0** trên toàn bộ | "Thịnh hành" thực chất là "mới nhất" |
| Story có nhạc | **0** | Tính năng gắn nhạc chưa từng được dùng thật |
| Post có nhạc | **Không tồn tại** | Chỉ story hỗ trợ, bài đăng thì không |
| Picker trên app | Tối đa 20 bài, không phân trang | Catalog > 20 bài thì người dùng không thấy phần còn lại |
| Đường nhập liệu tự động | **Không có** | Mọi bản nhạc mới đều là 1 lần gõ tay |

Nói cách khác: **phần đọc đã có, phần lớn lên thì không.** Đây là lý do thư viện đứng yên ở 10 bài.

---

## 3. "Trọn vẹn" nghĩa là gì

**Với người dùng:** mở picker, tìm theo tên/thể loại/cảm xúc, nghe thử, chọn một đoạn, gắn vào story **và** bài đăng, thấy tên bài + nghệ sĩ ở nơi phát lại. Danh sách đủ dài để cuộn được nhiều lần.

**Với moderator:** nhìn được kho đang có gì, bài nào đang được dùng, xuất được bản ghi giấy phép khi bị hỏi, ngưng được một bài vi phạm mà không làm hỏng nội dung đã đăng.

**Với sản phẩm:** kho lớn lên **mà không cần ai ngồi gõ tay** — nhập từ nguồn CC có sẵn metadata, và nhạc người dùng tự đăng trở thành "original sound" dùng lại được (cơ chế làm nên kho nhạc TikTok).

---

## 4. Khoảng trống theo tầng

| Tầng | Đang có | Thiếu | Hậu quả nếu để nguyên |
|---|---|---|---|
| **Dữ liệu** | 10 field cơ bản | cover, thể loại, cảm xúc, BPM, dấu vân tay âm thanh, nguồn nhập, phiên bản giấy phép | Không lọc/tìm được; không chống trùng được |
| **Nhập liệu** | Gõ tay từng bài | Adapter nhập từ nguồn CC, job chạy nền, báo cáo từng item | Kho không lớn hơn 10 bài |
| **Phát hiện trùng** | Không có | Dấu vân tay âm thanh + index unique | Nhập 2 nguồn → cùng 1 bài xuất hiện nhiều lần |
| **Đếm sử dụng** | `usageCount` tăng vô hạn, không phân rã | Rollup 7 ngày + job tính đêm | "Thịnh hành" mãi là bài cũ tích luỹ |
| **Picker** | 20 bài, `nextCursor: null` cố định | Phân trang keyset, lọc thể loại, nhãn original sound | Người dùng không biết kho có gì |
| **Post** | Không có `musicRef` | Field + validate + trả về khi đọc | Gắn nhạc chỉ dùng được cho story |
| **Admin** | Form gõ key, không lọc, không chi tiết | List chuẩn, chi tiết, upload thật, export bản quyền | Không vận hành được kho lớn |

---

## 5. Lộ trình 4 pha

### Pha 0 — Trang admin hoàn chỉnh *(của tôi, làm ngay)*

Dựng lại `/music` theo chuẩn list của admin, nghe thử được ngay trên list và trên trang chi tiết `/music/:id`, upload file thật thay gõ key, ngưng/khôi phục, lọc theo giấy phép, xuất CSV bản quyền.

**Lưu trữ đã chốt:** file nhạc vào **MinIO dùng chung** của dự án (`chat-media`), tách folder riêng `music-catalog/`; DB **chỉ lưu key**, không lưu file. Thời lượng đọc từ chính file bằng `music-metadata` nên form không còn ô nhập mili giây.

**Không đổi DB, không đụng app chat.** Vá được ngay lỗ hổng "track câm".
 Spec: `openspec/changes/music-catalog-ops`.

### Pha 1 — Hạ tầng dữ liệu *(cần backend)*

Thêm field + index cho catalog, collection đếm sử dụng theo ngày, script backfill 10 bản ghi hiện có (probe thời lượng, tính dấu vân tay, sinh preview). Đây là **điều kiện tiên quyết** cho pha 2 và 3.
. Cần quyết định: thêm `ffmpeg` vào image backend.

### Pha 2 — Nhập tự động + chống trùng *(cần backend)*

Adapter Openverse (gộp Jamendo CC, Freesound, Wikimedia — miễn phí, có sẵn `license`/`license_url`/`attribution`), job chạy nền có báo cáo từng item, chỉ nhận CC0/CC-BY, chống trùng bằng dấu vân tay trên nội dung âm thanh. Kèm bảng điều khiển import ở trang admin.


### Pha 3 — Phía người dùng *(cần backend + mobile)*

Picker phân trang + lọc thể loại, post gắn được nhạc, "original sound" tự sinh từ audio người dùng đăng, trending theo cửa sổ 7 ngày.
Ước lượng: **~1.5–2 tuần** (backend ~4 ngày, mobile ~1 tuần).

, có thể song song pha 2 và pha 3 phần backend nếu đủ người.

---

## 6. Thay đổi dữ liệu (pha 1)

Bảng `musictracks` thêm 11 field, không phá vỡ dữ liệu cũ (đều có default/nullable):

`provider` (manual | openverse | ugc) · `providerTrackId` · `licenseVersion` · `coverKey` · `genre` · `moods[]` · `bpm` · `fingerprint` (unique, sparse) · `fingerprintStatus` · `ownerId` (cho original sound) · `originPostId` · `usageCount7d`

Hai collection mới: `musicimportjobs` (nhật ký import), `musicusagedailies` (đếm theo ngày).

Ba index mới: `{isActive, usageCount7d}`, `{isActive, genre}`, unique sparse `{fingerprint}`.

**Backfill chạy 1 lần**, không xoá gì: bản ghi nào thiếu file âm thanh thì đánh dấu lỗi để moderator xử lý, không tự xoá.

---

## 7. Quyết định cần chốt

| # | Câu hỏi | Đề xuất của tôi |
|---|---|---|
| 1 | Nhận giấy phép **CC-BY-SA** không? | Tạm **không** — share-alike có thể buộc Moment gắn nhạc đó cũng phải chia sẻ tương tự. Nhận sau khi có ý kiến pháp lý |
| 2 | Thêm `ffmpeg` vào image backend? | **Chưa ở pha 0.** Thời lượng lấy bằng `music-metadata` (không cần binary). `ffmpeg` chỉ cần khi muốn cắt preview 30 giây thật — hiện `previewKey = audioKey` nên picker phát cả bài. Bật khi kho đủ lớn để băng thông thành vấn đề |
| 3 | Ai làm pha 3 mobile? | Cần 1 mobile owner; backend pha 3 có thể làm song song pha 2 |
| 4 | Có mua catalog thương mại (Epidemic / Jamendo Licensing) không? | **Chưa cần.** CC0/CC-BY đủ để kho lên hàng nghìn bài. Adapter thiết kế sẵn chỗ cắm nếu sau này mua |
| 5 | Nhạc người dùng đăng có được coi là "owned by Koola"? | **Có**, kèm cờ `provider: 'ugc'` + `ownerId` để moderator ngưng được và xử lý khi có khiếu nại |

---

## 8. Rủi ro

- **Nhạc do người dùng đăng** cho phép ai đó đăng nhạc có bản quyền rồi "sở hữu" sound đó. Giảm thiểu: sound UGC được đánh dấu riêng, lọc được ở admin, ngưng được bằng cùng một nút; xử lý theo báo cáo của chủ bản quyền.
- **Dấu vân tay bằng hash PCM** bắt được trùng byte/container nhưng **không** bắt được cùng một bài bị encode lại từ nguồn khác. Giảm thiểu: chỉ nhận nguồn đã lọc, và ghi rõ trần này trong code; khi báo cáo import lộ ra case thật thì nâng lên Chromaprint sau cùng interface.
- **Job import chạy trong process backend** — restart giữa chừng sẽ treo job. Giảm thiểu: job quá 10 phút ở trạng thái chạy tự đánh dấu `failed: interrupted`; chạy lại an toàn nhờ dedupe.
- **`ffmpeg` trong image** (chỉ khi bật pha preview) tăng ~70 MB và thành binary phải vá bảo mật định kỳ. Pha 0 không cần.
- **Dùng chung MinIO với media tin nhắn** — file nhạc nằm cùng bucket, khác prefix. Pha 0 **không đi qua `/media/upload`** mà tự ký PUT riêng, vì đường đó ghi bản ghi `Media` với `messageId: null` — đúng hình dạng mà job dọn rác được viết để xoá.
- **Nợ kỹ thuật phát hiện khi khảo sát:** `MediaCleanupService` (đánh dấu `messageId: null` là deleted sau 24h) **chưa được đăng ký** trong module nào — `MediaModule.providers` chỉ có `MediaService`. Nhờ vậy ảnh sản phẩm (cũng upload qua `/media/upload`) hiện vẫn còn. Nhưng nó là bom hẹn giờ: chỉ cần thêm một dòng `providers:` là ảnh sản phẩm và mọi file nhạc đi nhầm đường biến mất. Cần một change riêng sửa job này trước khi bật nó.
- **Đổi contract tạo track** (key phải tồn tại thật, thời lượng do server đọc) — chỉ ảnh hưởng trang admin, vốn được viết lại trong pha 0.

---

## 9. Chỉ số để biết đã "trọn vẹn"

| Mốc | Chỉ số | Ngưỡng |
|---|---|---|
| Sau pha 0 | Track "câm" tạo được | 0 |
| Sau pha 0 | Nghe thử được trên web (list + chi tiết) | Có, không cần rời trang |
| Sau pha 0 | File nhạc trong DB | 0 byte — chỉ key |
| Sau pha 0 | Thao tác admin lọc/xuất được | Có |
| Sau pha 2 | Track trong catalog | ≥ 1.000 |
| Sau pha 2 | Tỷ lệ trùng khi nhập | Đo được, < 5% |
| Sau pha 3 | Story/post có nhạc | > 0 và tăng theo tuần |
| Sau pha 3 | Picker cuộn hết được | Không giới hạn trang |
| Sau pha 3 | "Thịnh hành" phản ánh 7 ngày | Có |

---

## 10. Đề nghị

1. **Duyệt pha 0 ngay** — 1 tuần, không rủi ro dữ liệu, chặn được lỗi tạo track rác.
2. **Chốt mục 7.1, 7.2, 7.3** trước khi khởi động pha 1, vì chúng đổi thiết kế chứ không chỉ đổi lịch.
3. **Chỉ định backend owner cho pha 1–2** và **mobile owner cho pha 3**; pha 2 và phần backend pha 3 có thể chạy song song.
