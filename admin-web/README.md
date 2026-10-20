# Admin Web (Koola)

Trang quản trị nội bộ — React + TypeScript + Vite.

## Chạy dev (máy mới)

```bash
git clone https://github.com/phantanquoc/koola_app.git
cd koola_app/admin-web
npm install
cp .env.example .env   # sửa VITE_API_URL trỏ về backend staging, ví dụ http://<LAN-IP>:3000/api
npm run dev            # mở http://localhost:5173
```

Đăng nhập bằng tài khoản platform-admin (tạo bằng script
`chat-backend/scripts/grant-admin.ts`). Backend dev mặc định cho phép
origin `localhost:5173` và các máy cùng LAN chạy dev ở port 5173.

## Lệnh khác

```bash
npm run build    # tsc + build production → dist/
npm run lint     # ESLint
npm test         # vitest
npm run preview  # chạy thử bản production
```

## Quy ước quan trọng

- `VITE_API_URL` **phải gồm prefix `/api`** (VD `http://localhost:3000/api`) —
  thiếu là backend trả 404 toàn bộ. Đổi env phải restart dev server.
- REST-only: admin-web không dùng socket, mọi thay đổi xong thì refetch/polling.

## Tài liệu

- `AGENTS.md` — quy tắc code, kiến trúc trang, checklist trước khi báo done
- `DESIGN.md` — chuẩn giao diện (token, kit component, pattern từng route)
- `docs/task1.md` — đối chiếu hiện trạng + checklist việc còn thiếu
