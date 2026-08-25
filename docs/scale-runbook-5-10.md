# Scale runbook — monolith lên 5–10 instance (hậu `perf-audit-fix-and-scale-ready`)

> Trạng thái sau change `perf-audit-fix-and-scale-ready`: backend đã sẵn sàng scale ngang bằng monolith + LB + Redis share. **Chưa tách microservice.**

## 1. Kiến trúc mục tiêu

```
Mobile ──→ [ LB: nginx / ALB ] ─┬─ backend-1 ─┐
                             ├─ backend-2 ─┤── Redis (1 pub/sub chung, client share)
                             └─ backend-N ─┘── Mongo (1 primary, pool 20/instance)
                                                    MinIO / Coturn (giữ nguyên)
```

- Backend **stateless**: JWT (access in-memory, refresh trong Mongo), socket fanout qua `@socket.io/redis-adapter`, không giữ state trong RAM (ngoại trừ cache ngắn TTL-less — không có).
- Một Redis client duy nhất mỗi instance (`RedisService.getClient()`), `RedisIoAdapter` tái dùng nó (`main.ts:22, duplicate()` cho sub). **2 pool/instance trước đây đã xoá.**
- WebRTC timeout đã stateless (`deadlineAt` + `initiated_sessions` ZSET + claim nguyên tử) — không còn `callTimeouts: Map`.

## 2. Bắt buộc trước khi scale qua 1

| Việc | Đã làm trong change | Còn phải làm vận hành |
|---|---|---|
| Throttler | `RedisThrottlerStorage` (Lua INCR+EXPIRE) — quota global 60/1000 | đảm bảo `REDIS_URL` giống nhau mọi pod |
| Cron lock | `tryAcquireLock('lock:*')` cho 4 cron còn lại; `call-session-cron` vốn đã nguyên tử | không cần thêm — lock tự hết hạn |
| Mongo pool | `MongooseModule.forRoot(..., { autoIndex:false, maxPoolSize:20 })` | chạy `scripts/create-indexes.ts` **một lần** trước khi bật `autoIndex:false` rộng rãi |
| Index mới | `message {conversationId, deleted, createdAt}`, `userConversation {userId, joinedAt}`, `story {audienceScope}` | `explain()` các query nóng khi có MongoDB thật (vòng 3 chưa có DB để đo) |
| Nén + header | `compression()` + `helmet()` | không |

## 3. LB — sticky có cần không?

- **Không bắt buộc sticky** cho Socket.IO khi đã có `@socket.io/redis-adapter` — adapter lo fanout cross-instance.
- **Nhưng sticky (`ip_hash` / cookie) giảm 1 hop Redis** cho hot path `join_conversation` + `broadcastPresence` O(N conv) — khuyến nghị bật nếu LB hỗ trợ rẻ (nginx `ip_hash`).
- Health check: `GET /api/health` đã `@SkipThrottle({short:true,long:true})` nên LB probe không bị `429`.

## 4. Mongo pool toán học

- Mặc định Mongoose `maxPoolSize: 100` → 10 instance = **1000 kết nối** > `maxConnections` single node, dễ `MongoServerSelectionError`.
- Đổi `20/instance` → 10 instance = **200 kết nối**, dư dả cho single primary.
- `autoIndex: false` tránh 10 instance cùng `createIndex` khi rolling restart (thundering). Index tạo qua script một lần.

## 5. Rolling deploy

- **Dung sai mixed version:** instance cũ (chưa có lock) có thể chạy trùng 1 tick với instance mới (có lock) — an toàn vì filter cron là `updateMany` idempotent (tight filter). Lần deploy sau tick đó đã đồng nhất.
- **2 cron cùng `0 3 * * *`** (`media-cron` và `media-cleanup`) có **key lock riêng** (`lock:media-cron` vs `lock:media-cleanup`) nên không chặn nhau — kiểm tra log `Lock held by another instance — skipping` để xác nhận.
- Rollback: revert image tag; key lock Redis tự hết hạn (TTL 3000s cho daily, 90s cho per-minute); không cần rollback schema.

## 6. Typing — receiver-only

- Lưu `typing:<convId>:<userId> EX 5` trong Redis; gateway emit `user_typing` với `.except(user:<senderId>)` — sender không thấy typing của chính mình (fix BUG user báo).
- Client mobile tự clear sau 3s nếu không có event mới — nên phía server không cần huỷ timer.

## 7. Chưa làm — để sau

- Observability: `prom-client` + `pino`/`winston` + `otel` + `k6` (6.1) — vòng 3 mới chỉ gate `console.log`.
- Mobile perf (render, SQLite, sync) — ngoài scope backend.
- Tách microservice — Strangler đề xuất: Media/Translation → WebRTC → giữ Chat chung → Moments riêng.
