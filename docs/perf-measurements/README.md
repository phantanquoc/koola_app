# Số đo hiệu năng cuộn chat

Kết quả thô của `scripts/measure-chat-fling.sh` và `scripts/measure-chat-scroll.sh`.
Mỗi CSV: một dòng một mẫu — `sample,total_frames,janky_frames,janky_pct,p50_ms,p90_ms,p95_ms,p99_ms`.

**Luôn bỏ 2 mẫu đầu.** Chúng mang chi phí khởi động (shader/atlas/JIT) sau `gfxinfo reset`,
không phản ánh trạng thái cuộn ổn định.

## Hai máy dùng để đo

| id | máy | chip | màn |
|---|---|---|---|
| `7999fd53` | Xiaomi 15 Pro (2410DPN6CC) | Snapdragon 8 Elite 3.53 GHz | 120 Hz |
| `25c75ebf` | Mi 10T Pro (M2007J3SG) | Snapdragon 865 1.80 GHz | 144 Hz |

Hai máy lệch đẳng cấp rất xa. **Không bao giờ so build A trên máy này với build B trên máy kia** —
chênh lệch phần cứng sẽ nuốt trọn mọi khác biệt do code. Luôn A/B trên cùng một máy.

## Kết quả A/B commit `52936ff` (memoized MessageItem + mediaIndexService + pinnedContents)

Cùng hội thoại `69d38d516de36efd94b4edf1` (121 tin, 28 media), 6 mẫu × 12 fling.

Trên máy mạnh — không kết luận được gì, jank đã bằng 0 nên không còn chỗ để cải thiện:

| vòng | janky | p50 | p95 | p99 |
|---|---|---|---|---|
| `MASTER_on_799` | 0.00% | 8.2 | 40.8 | 57.8 |
| `MASTER_on_799_r2` | 0.00% | 6.8 | 32.2 | 47.8 |
| `FIX_on_799` | 0.00% | 9.5 | 37.5 | 55.0 |
| `FIX_on_799_r2` | 0.00% | 7.2 | 34.2 | 62.2 |

Dao động giữa hai vòng của cùng một build lớn hơn khác biệt giữa hai build.

Trên máy yếu — đây mới là nơi thấy được tín hiệu:

| vòng | frames | janky | p50 | p95 | p99 |
|---|---|---|---|---|---|
| `MASTER_on_25c` | 144 | **60.70%** | 8.5 | 102.0 | 147.0 |
| `FIX_on_25c` | 146 | **31.55%** | 11.0 | 88.0 | 236.5 |

Tỉ lệ giật giảm gần một nửa với cùng số frames. p99 xấu hơn do đúng một mẫu ngoại lai 550 ms.
Mới n=1 cặp hợp lệ — cần thêm 2–3 cặp nữa trước khi coi là kết luận.

## Cái bẫy đã làm hỏng 3 vòng đo

Trên máy yếu, chuỗi 12 cú fling đẩy danh sách trôi hẳn lên đầu lịch sử
("Bắt đầu cuộc trò chuyện"). Màn hình đứng yên thì không có khung hình nào để giật,
nên máy báo về số liệu **đẹp nhưng vô nghĩa**.

Dấu hiệu nhận biết: `total_frames` tụt đột ngột (~75–110 thay vì 120–270), `janky_pct` = 0.00,
`p99` dưới 15 ms. Các file `FIX_on_25c_r2` và `_r3` dính lỗi này và **không được dùng**;
`_r4` thì script tự abort đúng cách.

`verify_scrollable()` chỉ chạy một lần lúc khởi động nên không chặn được tình huống này.
Trước mỗi vòng phải chụp màn hình xác nhận đang ở giữa lịch sử, và soi lại cột `total_frames`
của từng mẫu sau khi chạy.

## Các file cũ hơn

`strong_*` / `weak_*` / `phase1_quoc` là số đo từ phiên trước (2026-08-04),
giữ lại để đối chiếu. `strong_BASELINE_FLING` so với `strong_FIXED_FLING2`
cho p99 58.5 ở cả hai — khớp với ghi nhận "NO improvement" trong commit `52936ff`.
