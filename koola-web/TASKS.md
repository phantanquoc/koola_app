# Koola Web Client — Plan & Task List

> Trạng thái: **PLAN, CHƯA CODE** (chốt 2026-10-15).
> Chi tiết thảo luận đầy đủ: memory `project-koola-web-client`.

## Mục tiêu

Bản web Koola dùng trên máy tính (như Zalo Web / Telegram Web):
mở trình duyệt → đăng nhập tài khoản Koola → nhắn tin realtime như trên điện thoại.

## Quyết định đã chốt

- **Repo**: monorepo, folder `koola-web/` (không tách repo riêng).
- **Deploy product**: monolith NestJS + web build tĩnh trên **1 VPS** trước
  (Nginx: `app.koola.chat` → web, `api.koola.chat` → backend).
  Không microservices. Tách VPS sau theo tài nguyên khi nghẽn thật (Coturn/storage trước).
- **Tech**: React 19 + Vite + TypeScript + PWA (khớp `admin-web`),
  `socket.io-client` nối namespace `/chat` hiện có, Zustand/Redux Toolkit,
  WebRTC thuần trình duyệt (phase 2), presigned URL MinIO tái dùng,
  access token trong memory + refresh token httpOnly cookie.
- **Backend giữ nguyên**, trừ các điểm có thể phải đụng (ghi ở Phase tương ứng).

## Phase 1 — Chat MVP (làm trước)

- [ ] Scaffold `koola-web/`: Vite + React 19 + TS + router (copy pattern từ `admin-web/`)
- [ ] Auth: login email/password + refresh token (tái dùng flow mobile)
- [ ] API client: axios + Bearer interceptor (tái dùng `admin-web/src/apiClient.ts`)
- [ ] Socket: `socket.io-client` nối `/chat`, join/leave room `conv:<id>`
- [ ] Danh sách hội thoại (3 cột kiểu Zalo Web) + unread badge
- [ ] Nhắn 1-1/nhóm realtime: gửi/nhận, typing, đã gửi/đã đọc
- [ ] Gửi ảnh/file qua presigned URL MinIO
- [ ] Tìm kiếm hội thoại/tin nhắn
- [ ] Backend (nếu cần): CORS + socket origin cho domain web; endpoint refresh httpOnly cookie
- [ ] Verify trên trình duyệt thật trước khi sang Phase 2

## Phase 2 — Gọi thoại/video trên web

- [ ] Voice/video 1-1 bằng `RTCPeerConnection` + signaling backend hiện có
- [ ] Chuông incoming call + call logs
- [ ] Lưu ý: DTO signaling đã `@IsObject()` nên web gửi object SDP được luôn

## Phase 3 — QR login + PWA

- [ ] Backend: module QR pairing (sinh QR → app quét xác nhận → web nhận token qua socket)
- [ ] PWA: cài như desktop app, badge unread, Notification API

## Phase 4 — Moments / Shopping / Connect lên web

- [ ] Mỗi cái là 1 epic riêng, làm sau khi chat + call ổn định

## Ghi nợ

- [ ] Bổ sung benchmark chi tiết Zalo/Telegram/Messenger (đã giao researcher)
- [ ] Tạo OpenSpec change khi bắt đầu implement Phase 1
