# apk-archive — Bản build perf lưu trữ

Thư mục này lưu các APK `perf` (release-equivalent, `__DEV__=false`,
`LOCAL_FIRST_SQLITE=true`, trỏ `http://192.168.2.110:3000`) để cài lại
nhanh khi cần đo perf / test trên máy thật mà không phải rebuild 8 phút.

| File | Nguồn | IP backend | Ghi chú |
|------|-------|------------|---------|
| `app-perf-2026-08-20.apk` (133 MB) | `ChatApp/android/app/build/outputs/apk/perf/app-perf.apk` build 2026-08-20 | `192.168.2.110:3000` | kèm `*-metadata.json` |

## Cài lại

```bash
# Chỉ máy 7999fd53 (2410DPN6CC)
adb -s 7999fd53 install -r apk-archive/app-perf-2026-08-20.apk

# Hoặc máy đang cắm duy nhất
adb install -r apk-archive/app-perf-2026-08-20.apk
```

## Lưu ý

- Nếu DHCP đổi IP Wi-Fi (`ipconfig` → `Wireless LAN adapter Wi-Fi` →
  `IPv4`), APK này sẽ **không login được** — phải rebuild perf sau khi chạy
  `npm run dev:sync-host` (đồng bộ `ChatApp/.env.perf` + `dev-config.json`).
- Đừng commit APK vào git (133 MB/file) — `.gitignore` đã chặn `apk-archive/`.
- Khi có bản perf mới, copy đè hoặc thêm file `app-perf-YYYY-MM-DD.apk` mới.
