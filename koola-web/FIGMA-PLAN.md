# Koola Web — Kế hoạch thiết kế toàn bộ (Phase 1)

> Mục tiêu: phủ hết mọi màn hình / trạng thái của một web chat hiện đại, không chỉ happy path.
> Nguồn token: `ChatApp/src/ui/theme.ts`. Nguồn luật UI: `openspec/ui-dna.md`.

---

## 1. Khảo sát — một web chat có những gì

Tham chiếu: Zalo Web, Telegram Web K, Messenger Web, WhatsApp Web, Slack, Discord.

### 1.1 Khung & điều hướng
- Rail 72px: Chat · Danh bạ · Cài đặt + avatar + đăng xuất
- Cột danh sách 340px: tiêu đề + nút tạo mới, ô tìm kiếm, chip lọc
- Vùng chat linh hoạt: header · vùng tin · composer
- Panel phải 340px (thông tin hội thoại) — đóng/mở được
- Responsive: 1280 gộp 68+320, tablet ẩn panel phải, mobile web không vỡ

### 1.2 Danh sách hội thoại
- Row: avatar 48 + chấm online, tên, preview 1 dòng, giờ, badge chưa đọc, tick, ghim, tắt thông báo
- Chip lọc: Tất cả / Chưa đọc / Nhóm
- Trạng thái: skeleton · trống · tìm không kết quả · offline banner
- Sắp xếp: ghim trước, rồi theo giờ mới nhất

### 1.3 Cửa sổ chat
- Header: avatar, tên, online/last-seen, ghimb, gọi thoại, gọi video, tìm kiếm, thông tin
- Thanh tin ghim (collapsible)
- Divider ngày, divider "Tin nhắn mới"
- Bubble: own (primary) / other (trắng viền), radius 18, max 65–70%
- Nhóm tin cùng người ≤5 phút: tin đầu avatar + tên, tin sau không
- Trạng thái gửi: đang gửi (đồng hồ) · đã gửi (1 tick) · đã nhận (2 tick) · đã đọc (2 tick xanh)
- Gửi lỗi: viền đỏ + chấm than + nút gửi lại
- Thu hồi: chữ nghiêng "Tin nhắn đã được thu hồi"
- Reply: trích dẫn trong bubble (thanh màu + tên + nội dung rút gọn)
- Reaction: pill dưới bubble, đếm số, của mình thì nền primarySoft
- Đính kèm: ảnh đơn / lưới ảnh / file (icon + tên + dung lượng + tải) / voice (play + waveform + thời lượng) / link preview (ảnh + tiêu đề + domain)
- Typing: bubble 3 chấm nảy, cao cố định, không đẩy layout
- Nút "xuống cuối" khi cuộn lên

### 1.4 Tương tác tin nhắn
- Hover → toolbar nổi: react · reply · forward · more
- Chuột phải → context menu: Sao chép · Trả lời · Chuyển tiếp · Ghim · Chỉnh sửa · Xoá · Báo cáo
- Reaction picker: 6 cảm xúc nhanh (❤️ 😆 😮 😢 😡 👍), hover để xem ai đã thả
- Popover "ai đã thả" chia theo cảm xúc
- Chuyển tiếp: modal chọn hội thoại, nhiều đích
- Xoá: xác nhận "Xoá ở phía tôi" / "Xoá cho mọi người"
- Chỉnh sửa: bubble chuyển sang chế độ sửa, có nhãn "Đã chỉnh sửa"

### 1.5 Composer
- Ô nhập multiline tự giãn (1→5 dòng)
- Hàng icon: đính kèm, ảnh, emoji, voice
- Gửi: nút tròn 52px, disabled khi rỗng
- Reply preview phía trên (thanh màu + tên + nội dung + ×)
- Preview đính kèm trước khi gửi (thumb + tên + dung lượng + ×)
- Kéo-thả file vào vùng chat → overlay dashed "Thả để gửi"
- Emoji picker: tab cảm xúc / sticker / GIF, ô tìm, lưới emoji, gần đây
- Phím tắt: Enter gửi, Shift+Enter xuống dòng
- Hiển thị "Đang soạn…" đẩy lên socket

### 1.6 Tìm kiếm
- Tìm trong hội thoại: panel phải, kết quả highlight, nhảy tới tin
- Tìm toàn cục: người + tin nhắn + file, chia nhóm
- Ctrl+K command palette

### 1.7 Gọi
- Gọi đến: card giữa, rung, từ chối (đỏ) / nghe (xanh), đổ chuông
- Gọi đi: "Đang đổ chuông…", huỷ
- Đang gọi thoại: nền tối, avatar lớn, tên, đồng hồ, hàng nút: mic · loa · video · thêm · kết thúc
- Video call: toàn màn hình, self-view PiP, thanh điều khiển, tên + đồng hồ, thu nhỏ
- Gọi nhóm: lưới 2×2 / 3×3, mỗi ô có tên + icon tắt mic, ô đang nói có viền primary
- Thu nhỏ: widget nổi góc phải trên composer
- Nhật ký gọi trong hội thoại: icon gọi đi/đến/nhỡ + thời lượng
- Trạng thái: đang kết nối, kết nối kém, mất kết nối, người kia từ chối

### 1.8 Danh bạ
- Tabs: Bạn bè / Nhóm / Lời mời
- Row: avatar + trạng thái + nút nhắn tin
- Thẻ hồ sơ phải: avatar lớn, tên, email, pill online, 3 hành động (Gọi / Nhắn tin / Kết bạn), thông tin liên hệ
- Lời mời: chấp nhận / từ chối
- Chặn / bỏ chặn

### 1.9 Cài đặt
- Tài khoản: avatar, tên, email, chỉnh sửa, đổi mật khẩu
- Thông báo: đẩy, âm thanh, thông báo cuộc gọi, tắt theo hội thoại
- Giao diện: Sáng / Tối / Theo hệ thống, cỡ chữ, hình nền, mật độ
- Quyền riêng tư: ai thấy trạng thái online, ai nhắn được, ai gọi được, chặn
- Bảo mật: 2FA, phiên đăng nhập (thiết bị + thời gian + đăng xuất từng phiên), lịch sử đăng nhập
- Ngôn ngữ: Tiếng Việt / English
- Phím tắt: bảng tra
- Dung lượng & dữ liệu: cache, xoá cache, tự tải media
- Giới thiệu: phiên bản, điều khoản, chính sách

### 1.10 Hệ thống
- Toast thành công / lỗi
- Modal xác nhận
- Skeleton tải
- Offline banner + hàng đợi gửi lại
- PWA install prompt
- Trạng thái trống từng khu vực
- Keyboard shortcuts

---

## 2. Bản đồ màn hình ↔ frame Figma

| # | Frame | Nội dung |
|---|-------|----------|
| S01 | Splash | Logo, thanh tiến trình, chuyển cảnh vào Login |
| S02 | Đăng nhập | Thẻ logo + slogan, form, CapsLock, ẩn/hiện mật khẩu |
| S03 | Đăng nhập lỗi | Viền đỏ, cảnh báo, còn N lần thử |
| S04 | Đăng nhập QR | Mã QR, trạng thái chờ, chuyển sang mật khẩu |
| S05 | Shell + danh sách | Rail, search, chip, 6 hội thoại, empty state |
| S06 | Trạng thái danh sách | Spec: skeleton · trống · không kết quả · offline |
| S07 | Chat đầy đủ | Ghim, divider, reply, reaction, ảnh, file, voice, typing, lỗi gửi |
| S08 | Chat dark | Cùng bố cục, bộ token tối |
| S09 | Hành động tin nhắn | Hover toolbar + context menu |
| S10 | Reaction | Picker 6 cảm xúc + pill + popover ai đã thả |
| S11 | Composer | Spec: rỗng · reply · đính kèm · kéo-thả |
| S12 | Emoji picker | Tab, tìm, lưới emoji, gần đây |
| S13 | Trạng thái tin nhắn | Spec: đang gửi · đã gửi · đã đọc · lỗi · thu hồi |
| S14 | Lightbox ảnh | Ảnh lớn, dải thumbnail, tải, đóng |
| S15 | Chuyển tiếp + Xoá | 2 modal |
| S16 | Tìm trong hội thoại | Panel kết quả, highlight, điều hướng |
| S17 | Info panel | Thành viên, file, liên kết, hành động |
| S18 | Tạo nhóm | Chọn thành viên, đặt tên, ảnh nhóm |
| S19 | Gọi đến | Card giữa, từ chối / nghe |
| S20 | Đang gọi đi | Đổ chuông, huỷ |
| S21 | Gọi thoại | Nền tối, avatar, đồng hồ, hàng nút |
| S22 | Video call | Toàn màn hình, PiP, thanh điều khiển |
| S23 | Group video | Lưới 2×2, chỉ báo mic, ô đang nói |
| S24 | Call minimized + nhật ký | Widget nổi + log cuộc gọi |
| S25 | Danh bạ + hồ sơ | Tabs, danh sách, thẻ hồ sơ |
| S26 | Cài đặt — Tài khoản | Hồ sơ, đổi mật khẩu |
| S27 | Cài đặt — Giao diện + Thông báo | Sáng/Tối/Hệ thống, toggle |
| S28 | Cài đặt — Riêng tư + Phiên | Ai thấy gì, thiết bị đăng nhập |
| S29 | Cài đặt dark | Biến thể tối |
| S30 | Phím tắt + PWA | Bảng phím + prompt cài đặt |
| S31 | Toast | Thành công · lỗi · thông tin · hoàn tác |
| S32 | Command palette | ⌘K: hành động + tin nhắn + file |
| S33 | Nhóm: thành viên | Danh sách, vai trò, rời/xoá nhóm |
| S34 | Trạng thái cuộc gọi | Kết nối kém · bị từ chối · không trả lời |
| S35 | Divider tin nhắn mới | Mốc chưa đọc trong hội thoại |
| S36 | Cài đặt · Ngôn ngữ | 4 ngôn ngữ, áp dụng ngay |
| S37 | Cài đặt · Giới thiệu | Phiên bản, cập nhật, liên kết pháp lý |
| S38 | Cài đặt · Dung lượng | Thanh phân đoạn, xoá cache, tự tải |
| S39 | Responsive 1280 | Rail 64 + list 300 + chat, ẩn panel phải |
| S40 | Component set | 12 bộ variant thật (37 component) — kéo từ Assets panel |
| S41 | Quên mật khẩu | Gửi mã đặt lại qua email/SĐT |
| S42 | Đặt lại mật khẩu | OTP 6 ô + độ mạnh mật khẩu + quy tắc |
| S43 | Đăng ký | 3 tab Email/SĐT/QR, điều khoản |
| S44 | Xác minh OTP | 6 ô OTP, đếm ngược, đổi số |
| S45 | Xác thực 2 lớp | Chọn phương thức + 8 mã khôi phục |
| S46 | Ghi âm giọng nói | Sóng âm, đếm giờ, huỷ/gửi |
| S47 | Kéo thả tệp | Overlay dropzone + định dạng cho phép |
| S48 | Chat: đang tải & trống | 3 cột: skeleton · trống · lỗi tải |
| S49 | Danh sách dark | Bản tối của S05 + menu thao tác |
| S50 | Đăng nhập dark | Bản tối của S02 |
| S51 | Component set 2 | 10 bộ variant nữa (tổng 22 bộ / 63 component) |


---

## 3. Component set (S40 — đã dựng thật trong Figma)

12 bộ variant, 37 component, đặt tên 1-1 với file code sau này:

| Component | Variants |
|---|---|
| `Avatar` | Size 48/40/32 × Status Online/Offline/Group |
| `Badge` | Tone Primary/Danger/Success, Value 2/5/99+/On |
| `Chip` | State Active/Default/Hover |
| `IconButton` | State Default/Hover/Active/Disabled |
| `Toggle` | State On/Off |
| `Toast` | Tone Success/Error/Info/Undo |
| `ChatBubble` | Owner Mine/Other × Kind Text/Reply |
| `ReactionPill` | State Other/Mine/Add |
| `ConversationRow` | State Default/Unread/Active/Pinned/Menu |
| `TypingDots` | Tone Other |
| `SkeletonRow` | Type Conversation |
| `EmptyState` | Kind NoConversation/NoResults |
```

### S51 — 10 bộ bổ sung

| Component | Variants |
|---|---|
| `SearchBar` | State Default/Focus |
| `ReplyPreview` | Tone Neutral/Mine |
| `AttachmentPreview` | Kind Image/File |
| `DateDivider` | Label Day/Unread |
| `Modal` | Tone Default/Danger |
| `PinnedBar` | State Expanded/Collapsed |
| `HoverToolbar` | State Default |
| `SettingsRow` | Kind Toggle/Chevron/Danger |
| `ReactionPicker` | State Default |
| `ContextMenu` | State Message/Conversation |

---

## 4. Ma trận trạng thái (bắt buộc có, không chỉ happy path)

| Khu vực | Trạng thái |
|---|---|
| Danh sách | đang tải · có dữ liệu · trống · không kết quả · offline |
| Chat | đang tải lịch sử · có tin · trống · cuộn lên (nút xuống cuối) |
| Tin nhắn | đang gửi · đã gửi · đã nhận · đã đọc · lỗi · thu hồi · đang sửa |
| Composer | rỗng · đang gõ · nhiều dòng · reply · có đính kèm · kéo-thả · emoji mở |
| Cuộc gọi | gọi đến · gọi đi · đang nói · kết nối kém · bị từ chối · thu nhỏ |
| Danh bạ | có dữ liệu · trống · đang tải lời mời · đã chặn |
| Cài đặt | bình thường · đang lưu · lỗi lưu |

---

## 5. Ánh xạ lộ trình

- **Phase 1 (đang làm)**: S01–S20, S25–S51. Gọi (S19–S24) vẽ nhưng khoá ở code.
- **Phase 2**: gọi thoại/video thật (S21–S23), nhật ký gọi (S24).
- **Phase 3**: QR login (S04), PWA (S30).
- **Phase 4**: Moments / Shopping / Connect — epic riêng.

---

## 6. Việc tiếp theo sau khi duyệt Figma

1. Chốt frame → export spec (spacing, size, màu) thành CSS var.
2. Code theo thứ tự: token → primitive → shell → list → chat → composer → settings.
3. Bảng phím tắt (S30) thành hằng số dùng chung cho tooltip + modal.
4. Đổi tên variant (S40) khớp enum trong code: `owner: 'mine' | 'other'`, `kind: 'text' | 'reply'`.
