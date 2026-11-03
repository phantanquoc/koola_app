# Design

## Context

Measured from the tree:

| Sự thật | Nơi đo |
|---|---|
| Mỗi lần trả nhạc là một lần ký mới | `moments.service.ts:1218` (list, `Promise.all` trên ≤20 track), `:1258` (detail) |
| `presignedGetObject` nhận `respHeaders` nhưng chỉ dùng cho `response-*` | `minio/dist/main/internal/client.d.ts:375`, `PreSignRequestParams` là `{[k:string]:string}` |
| Không có CDN/edge nào trong repo | `find` không thấy nginx/traefik cho media; chỉ có `admin-web/nginx.conf` |
| Dev đặt bucket public | `docker-compose.yml:71` `mc anonymous set download local/chat-media` |
| DB chỉ lưu key, không lưu URL | không field `http` nào trong `media.schema.ts`, `moments/schemas/*`, `commerce/**/schemas/*` |
| Media chat gắn hội thoại | `media.schema.ts` có `conversationId`, `messageId` |
| Mobile dựa vào presign ở nhiều nơi | `ShoppingHomeScreen`, `ShoppingProductDetailScreen`, `MomentViewerScreen` đều có "URL hết hạn ≈1h → refetch" |

Hai loại nội dung trộn lẫn trong một bucket, khác nhau ở chỗ ai được xem:

- **Công khai**: nhạc catalog, ảnh sản phẩm, media của story `audienceScope: public` — ai có key cũng xem được, key không đoán được (UUID), nội dung không đổi.
- **Riêng tư**: media tin nhắn, story `connections`/`custom`, giấy tờ doanh nghiệp — phải kiểm quyền, không được để URL sống vĩnh viễn.

## Goals / Non-Goals

**Goals:** nội dung công khai có URL bất biến để cache được ở mọi tầng (thiết bị, proxy, CDN); không phá đường riêng tư; không cần đổi client.

**Non-Goals:** CDN cho nội dung riêng tư; ký cookie; transcode; đổi cấu trúc URL của media chat.

## Decisions

### D1. "Công khai" là thuộc tính của **key**, không của module

Một key công khai khi object không cần kiểm quyền để đọc. Quy tắc: **prefix quyết định**.

| Prefix | Loại | Cách phục vụ |
|---|---|---|
| `music-catalog/` | công khai | URL tĩnh |
| `music/` (seed cũ) | công khai | URL tĩnh |
| `commerce/` | công khai | URL tĩnh |
| `uploads/<userId>/` | riêng tư | presign như hiện tại |
| `thumbnails/<userId>/` | riêng tư | presign như hiện tại |

Kiểm bằng danh sách prefix trong một file, không suy ra từ `conversationId` (một media có thể chưa gắn hội thoại lúc mới upload). Prefix là thứ duy nhất kiểm được **trước khi** có row DB, và nó là ranh giới bảo mật rõ ràng: một object nằm dưới `music-catalog/` được coi là công khai **về mặt thiết kế**, không phải tình cờ.

Hệ quả bảo mật phải nói rõ: **không ai được upload nội dung riêng tư vào prefix công khai**. Đường upload công khai duy nhất là endpoint admin ký PUT (đã có ở `music-catalog-ops`) và đường upload ảnh commerce. Media người dùng luôn đi vào `uploads/<userId>/`.

### D2. URL tĩnh, không chữ ký

```
MEDIA_PUBLIC_BASE_URL=https://media.koola.app   # prod (CDN hoặc MinIO sau proxy)
MEDIA_PUBLIC_BASE_URL=http://localhost:9000     # dev
```

`publicUrlFor(key)` = `${MEDIA_PUBLIC_BASE_URL}/${MINIO_BUCKET}/${key}`, encode từng segment nhưng **giữ** `/`.

Thiếu biến môi trường → trả về `null` và **rơi về presign**. Đây là điều kiện để change này deploy được trước khi hạ tầng CDN tồn tại: không có biến thì hành vi y hệt hôm nay.

Vì sao không dùng `presignedGetObject` với thời hạn rất dài (ví dụ 7 ngày): vẫn là chữ ký riêng cho từng request nếu tham số thời điểm khác nhau, vẫn không cache chung được, và một URL hết hạn sau 7 ngày là lỗi hẹn giờ. URL tĩnh không có hạn — chấp nhận được chỉ vì nội dung công khai và bất biến.

### D3. `Cache-Control` gắn lúc upload, không gắn lúc đọc

Không đặt header qua presigned URL: `presignedGetObject` chỉ ký được `response-*`, và chèn `cache-control` tuỳ ý vào request sau khi ký sẽ làm **hỏng SigV4** (MinIO trả 403). Với URL tĩnh cũng vậy — header phải đến từ siêu dữ liệu của object hoặc từ proxy, không từ query string.

Nên: khi upload object công khai, đặt metadata:

```
Content-Type: <mime>
Cache-Control: public, max-age=31536000, immutable
```

MinIO trả metadata này cho mọi GET. CDN đọc và cache. Không có header nào bị ký.

`immutable` chỉ đúng vì key là UUID và nội dung không bao giờ ghi đè — đã kiểm: không change nào cho phép thay file của một key đã tồn tại (thay audio của track nằm ngoài phạm vi mọi change hiện có).

### D4. Metadata có thể bù cho object cũ

Object đã upload trước change này không có `Cache-Control`. Hai cách:

- **Lười (chọn)**: để proxy/CDN gắn header khi phục vụ (`nginx: add_header Cache-Control ... always;`). Không chạm dữ liệu, không script backfill, và header vẫn đúng cho mọi object cũ lẫn mới.
- **Sạch**: `copyObject` từng key để đặt lại metadata — một script chạm toàn bộ catalog, rủi ro đứt giữa chừng, lợi ích bằng 0 so với cách trên.

Chọn cách proxy. Ghi trong runbook, không viết script.

### D5. Ranh giới riêng tư giữ nguyên tuyệt đối

`GET /media/download/:key` hiện kiểm `mediaModel.findOne({ mediaKey })` + membership hội thoại. Không đổi. Media chat **không** được chuyển sang URL tĩnh ngay cả khi hội thoại là công khai — quyền thành viên có thể thay đổi, URL tĩnh thì không rút lại được.

Story `public` là ngoại lệ được cân nhắc và **vẫn giữ presign** ở change này: story hết hạn sau 24h, và một URL tĩnh sống vĩnh viễn cho nội dung 24h là rò rỉ vĩnh viễn. Chỉ nhạc và ảnh sản phẩm — thứ không hết hạn và không thuộc về người dùng — đi đường tĩnh.

## Risks / Trade-offs

- **Ảnh sản phẩm hiện sống nhờ một bug tiềm ẩn** → chúng upload qua `/media/upload` nên có `Media` row `messageId: null`, đúng hình dạng `MediaCleanupService` được viết để xoá sau 24h; service đó chưa được đăng ký nên chưa ai bị xoá. Nếu change này chuyển prefix ảnh commerce sang `commerce/` và bỏ đường upload chung, phải làm cùng lúc với việc sửa job dọn rác — nếu không, bật cleanup sẽ xoá sạch ảnh catalog. Ghi thành điều kiện tiên quyết ở tasks.
- **Nội dung công khai trở nên thực sự công khai** → ai có key đều xem được vĩnh viễn, không thu hồi. Đó là bản chất của nhạc CC0/CC-BY và ảnh sản phẩm; chấp nhận và ghi rõ.
- **Upload nhầm prefix = rò rỉ** → giảm thiểu: chỉ hai đường upload công khai (admin music PUT, commerce image), cả hai đều do server ký key; test khẳng định media người dùng không bao giờ nhận prefix công khai.
- **Phụ thuộc hạ tầng mới** → nếu CDN chết, nhạc không phát. Giảm thiểu: `MEDIA_PUBLIC_BASE_URL` có thể trỏ thẳng MinIO; CDN là tuỳ chọn, không bắt buộc.
- **Cache vĩnh viễn nghĩa là sửa lỗi nội dung phải đổi key** → đúng, và đó là cách nó nên hoạt động. Nếu sau này cần thay audio của một track, phải là "upload key mới + trỏ lại", không phải ghi đè.
- **Dev và prod khác nhau** → dev public bucket không có CDN, prod có. Cùng một URL shape nên code không phân nhánh.

## Migration Plan

1. Thêm `MEDIA_PUBLIC_BASE_URL` (rỗng ở dev trước) → hành vi không đổi, deploy an toàn.
2. Bật URL tĩnh cho **nhạc catalog** trước (ít nơi dùng nhất, dễ rollback nhất).
3. Bật cho **ảnh commerce**.
4. Đặt proxy/CDN, đặt `Cache-Control` ở proxy, đo hit-ratio.
5. Rollback: xoá biến môi trường → quay lại presign ngay, không cần deploy code.

## Open Questions

- Domain CDN thật (`media.koola.app`?) và ai quản lý chứng chỉ — cần chốt trước bước 4.
- Có giữ luôn đường presign cho nội dung công khai như một fallback không? Đề xuất **có**, trong 1 release, để client cũ không gãy.
