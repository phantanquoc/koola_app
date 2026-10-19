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
