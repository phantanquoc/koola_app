# Koola Web — Figma Checklist

> Nguồn chuẩn: `ChatApp/src/ui/theme.ts` + `openspec/ui-dna.md`.
> Figma web client dùng **dải Tiffany** làm màu chủ đạo, không phải primary xanh dương của mobile.
> Danh sách đầy đủ màn hình: [FIGMA-PLAN.md](./FIGMA-PLAN.md).

## 0. Token đã khoá

- [x] Bề mặt: ink `#101828`, muted `#667085`, faintInk `#68717F`, line `#E4E7EC`, canvas `#F3F3F3`, surface `#F5F7F9`
- [x] Tiffany 10 bậc: `50 #E6FAF9` → `500 #0ABAB5` (gốc) → `900 #083F3D`
- [x] `primary = tiffany700 #0B736F` (5.68:1 với chữ trắng — đạt AA)
- [x] `primaryHover = tiffany600 #0A8F8A` (chỉ dùng cho trạng thái rê chuột)
- [x] `primaryDark = #0A5754` (pressed)
- [x] Trạng thái: `accent` / `online` = `#0A8F8A`, `danger #DC2626`, `dangerInk #B42318`, `warnInk #B45309`
- [x] Brand (chỉ trong logo): `brandRed #E12D24`, `brandBlue #1E50C8`, `brandGreen #1FA64A`
- [x] Dark: canvas `#0F1419`, surface `#1C2026`, `primary #4FD9D5`, `primarySoft #083F3D`
- [x] Thang chữ `TY`: micro 10 · tiny 11 · caption 12 · bodySm 13 · label 14 · body 15 · heading 20 · title 24 · display 32
- [x] Bán kính `R`: xs2 4 · xs 8 · sm 10 · md 14 · bub 16 · lg 20 · xl 24 · pill 999
- [x] Bóng `shadowL`: sm / md / lg / xl / glow — chỉ 5 mức
- [x] Nội dung lên cao bằng `hairline()` (viền mảnh) thay vì chồng bóng

## 1. Khung màn hình (74 màn, 10 nhóm)

Bố cục file: Page → 10 section frame → các màn bên trong.

- [x] **01 Đăng nhập & xác thực** (10): splash, login, lỗi, QR, quên/đặt lại mật khẩu, đăng ký, OTP, 2FA, dark
- [x] **02 Khung & danh sách** (8): shell, 4 trạng thái danh sách, chat tải/trống, divider tin mới, thư mục, dark, tin chờ, responsive 1280
- [x] **03 Cửa sổ chat** (8): chat đầy đủ, dark, hover toolbar, reaction, 8 trạng thái tin, chọn nhiều, ai đã xem, info panel
- [x] **04 Soạn tin** (8): composer 5 trạng thái, emoji, sticker/GIF, ghi âm, voice player, kéo thả, hẹn giờ, bình chọn
- [x] **05 Media & tìm kiếm** (6): lightbox ảnh, xem video full, kho media, tìm trong chat, tìm nâng cao, command palette
- [x] **06 Lớp phủ & hội thoại** (4): chuyển tiếp/xoá, tạo nhóm, thành viên nhóm, toast
- [x] **07 Gọi thoại & video** (7): gọi đến/đi, voice, video, group video, thu nhỏ + nhật ký, 3 trạng thái lỗi
- [x] **08 Danh bạ & cài đặt** (9): danh bạ + hồ sơ, tài khoản, giao diện, riêng tư, dark, ngôn ngữ, giới thiệu, dung lượng, phím tắt + PWA
- [x] **09 Thư viện** (3): 2 bộ component (22 set / 63 variant), bảng màu 47 swatch
- [x] **10 Hệ thống & tiện ích** (11): hết phiên, 404, mất kết nối, trung tâm thông báo, tin đã lưu, tin đã ghim, link preview, @mention, lời mời nhóm, phân quyền, báo cáo

## 2. Component set (Assets panel)

- [x] Nhận diện: BrandMark (4 variant), BrandSignature (4), Avatar (4), Badge (4), Chip (3)
- [x] Hành động: PrimaryButton (5), IconButton (4), Toggle (2)
- [x] Tin nhắn: ChatBubble (4), ReactionPill (3), Composer (4), Toast (4)
- [x] Danh sách: ConversationRow (5), TypingDots (2), SkeletonRow (2), EmptyState (2), CallControls (3), VideoTile (4)
- [x] Bổ sung: SearchBar, ReplyPreview, AttachmentPreview, DateDivider, Modal, PinnedBar, HoverToolbar, SettingsRow, ReactionPicker, ContextMenu
- [x] Icon Lucide v1.69 (ISC), tải từ `unpkg.com/lucide-static`

## 3. A11y — đã đo bằng công thức WCAG

- [x] Chữ trắng trên `primary` = 5.68:1 (AA)
- [x] `ink` trên panel = 17.75:1 · `muted` = 4.97:1 · `faintInk` = 4.93:1
- [x] `dangerInk` trên `dangerSoft` = 5.38:1
- [x] Chấm `online` = 3.96:1 (đủ 3:1 cho non-text)
- [ ] Kiểm tra reduced-motion khi build code
- [ ] Mọi màn lỗi/loading/empty đều có (đã có ở S06, S48, S34, S63–S65)

## 4. Chưa làm

- [ ] Onboarding lần đầu
- [ ] Dịch tin nhắn
- [ ] Chuyển tiếp chuỗi nhiều bước
- [ ] Prototype nối các luồng mới (mới nối Splash → Login → Chat)
- [ ] Export spec thành CSS custom properties

## 5. Tham khảo

- Zalo Web (chat.zalo.me), Telegram Web (web.telegram.org/k), Messenger, WhatsApp Web
- Figma Community: "Horaz Messenger", "Teamwise Slack Clone", "Frames X Chats"
- Code: shadcn/ui + HextaUI / Cuelark / Kibo UI
- Hình: unDraw, Storyset; avatar: DiceBear, ui-avatars
