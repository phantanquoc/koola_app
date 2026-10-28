# Việc cần làm ở `ChatApp/` (client mobile)

> Sinh ra từ các vòng hoàn thiện admin (2026-10-28). **Backend đã xong** — dưới đây chỉ
> còn phần client. Không mục nào cần sửa backend.
>
> Trạng thái đối chiếu: `ChatApp/src` **chưa có** `appeal` và chưa gọi `config/public`
> (grep ngày 2026-10-28).
>
> ⚠️ **Mục 1 cần đọc kỹ phần "Có token bằng cách nào khi đang bị cấm"** — người bị cấm
> không đăng nhập được, họ chỉ có `appealToken` 10 phút trong response 403.

---

## 1. Màn hình nộp kháng nghị

**Vì sao:** backend vừa có `POST /appeals` nên hàng đợi `/admin/appeals` mới có nguồn dữ
liệu thật. Người bị cấm/gỡ nội dung hiện không có chỗ nào bấm — họ chỉ biết mình bị xử lý.

### Có token bằng cách nào khi đang bị cấm?

Người bị cấm **không đăng nhập được** — `POST /auth/login` trả `403` kèm
`code: 'account_banned'` và **`appealToken`**:

```json
{
  "statusCode": 403,
  "code": "account_banned",
  "message": "Account has been banned. Contact support for assistance.",
  "banReason": "spam",
  "bannedUntil": null,
  "appealToken": "<jwt 10 phút>"
}
```

`appealToken` là **vé một-mục-đích**, không phải phiên đăng nhập:

- dùng được **duy nhất** cho `POST /appeals`; mọi route khác trả `403`
- không có refresh token — hết 10 phút phải đăng nhập lại để lấy vé mới
- **không** lưu vào chỗ lưu access token. Giữ trong state của màn hình khoá, xoá
  khi rời màn hình. Đừng gán vào `apiClient` toàn cục: app sẽ tưởng đã đăng nhập.

Gợi ý luồng: login → nhận 403 `account_banned` → hiện màn hình khoá (lý do, hạn cấm)
+ ô nhập kháng nghị → gọi `POST /appeals` với header `Authorization: Bearer <appealToken>`.

### Endpoint

```
POST /api/appeals          (cần token — access token, hoặc appealToken nếu đang bị cấm)
Content-Type: application/json

{
  "targetType": "ban" | "takedown" | "soft-delete",
  "targetId":  "<id>",
  "message":   "<= 2000 ký tự, không rỗng"
}
```

Không gửi `userId` — server lấy từ token, gửi thêm sẽ bị `400 property userId should
not exist`.

`targetId`:
| targetType | targetId là gì |
|---|---|
| `ban` | **chính `userId` của người gọi** (không phải id lệnh cấm) |
| `takedown` | `_id` của story bị gỡ |
| `soft-delete` | `_id` của tin nhắn bị gỡ |

### Response

`201`
```json
{
  "message": "Đã ghi nhận kháng nghị",
  "appeal": { "_id": "...", "status": "pending", "targetType": "ban", "targetId": "...", "createdAt": "..." }
}
```

### Mã lỗi phải hiển thị đúng nghĩa

| HTTP | message từ server | UI nên nói |
|---|---|---|
| 400 | `Nội dung kháng nghị không được để trống` | Lỗi form tại chỗ |
| 400 | `Tài khoản hiện không bị cấm` / `Story hiện không bị gỡ` / `Tin nhắn hiện không bị gỡ` | "Hiện không có gì để kháng nghị" — ẩn nút thay vì để bấm rồi báo lỗi |
| 403 | `Chỉ được kháng nghị hình phạt của chính mình` | Không hiển thị (đây là lỗi lập trình phía client) |
| 404 | `... không tồn tại` | "Nội dung đã bị xoá vĩnh viễn" |
| 409 | `Kháng nghị cho nội dung này đang chờ xử lý` | "Bạn đã gửi rồi, đang chờ xem xét" + ẩn nút |
| 429 | `Bạn đã gửi quá nhiều kháng nghị...` | Đếm ngược hoặc nói "thử lại sau" |

### Điểm vào (gợi ý)

- **Bị cấm:** bắt `403` có `code: 'account_banned'` từ `POST /auth/login` → dùng luôn
  `appealToken` trong cùng response (xem mục trên). Không cần và không thể đăng nhập
  trước rồi mới kháng nghị.
- Người bị cấm dùng access token cũ (cấp trước khi bị cấm) cũng bị chặn ở mọi route —
  `JwtAuthGuard` đọc `isBanned` từ DB mỗi request, nên ban có hiệu lực ngay.
- **Story bị gỡ / tin nhắn bị gỡ:** chỗ hiển thị "(Nội dung đã gỡ)" thay bằng nút
  "Yêu cầu xem xét lại", chỉ hiện khi `authorId === currentUserId`.

### Lưu ý

- Không gửi `userId` trong body — server lấy từ token. Gửi thêm sẽ bị `forbidNonWhitelisted`
  trả 400.
- Một hình phạt chỉ có **một** kháng nghị đang chờ. Sau khi nộp, lưu state để ẩn nút cho
  tới khi server đổi trạng thái.
- `targetId` với `ban` là `userId` — dễ nhầm thành id của bản ghi ban (không có bản ghi đó).

---

## 1b. Gửi phiên bản app qua header (BẮT BUỘC để admin chọn được mốc ép cập nhật)

**Vì sao:** trang Cấu hình → "Ép cập nhật" cần biết **bản nào đang chạy ngoài đời**
trước khi chọn mốc chặn. Repo chưa có app trên App Store/Play (`itunes lookup` trả
0 kết quả, Play Store 404) và không có project `ios/`, nên không có store nào để
tra. Cách duy nhất có dữ liệu thật là app tự khai — giống Firebase Remote Config.

### Gửi gì

Mỗi request tới backend (chỉ cần khi đã đăng nhập):

```
X-App-Platform: ios | android | web
X-App-Version:  <versionName hiện tại, dạng 1.2.3>
```

Server sẽ ghi `lastAppPlatform`/`lastAppVersion` của tài khoản (dedupe 24 giờ/phiên
bản) và tổng hợp thành `GET /admin/client-versions`.

### Lấy version ở đâu trong code

| Nền tảng | Nguồn |
|---|---|
| Android | `versionName` trong `android/app/build.gradle` (hiện `"1.0"`) — đọc lúc runtime qua native module, không hardcode |
| iOS | `CFBundleShortVersionString` trong `Info.plist` (chưa có project `ios/` trong repo) |

Gợi ý: axios request interceptor trong `services/api/apiService.ts` đã có sẵn chỗ
gắn `Authorization` — thêm 2 header ở cùng chỗ đó.

### Quy tắc

- **Không** dùng `package.json` version (`0.1.0`) làm version app: nó là version
  của JS bundle, không phải bản người dùng cài.
- Version sai định dạng (`"1.0-beta"`) sẽ bị server **bỏ qua im lặng** — chỉ nhận
  `\d{1,4}(.\d{1,4}){0,3}`.
- Thiếu header không làm hỏng request (app cũ vẫn chạy), nhưng tài khoản đó sẽ
  nằm trong nhóm `unknown` và admin không chọn được mốc chính xác cho nó.
- Gửi kèm **mọi** request đã đăng nhập (interceptor) thay vì chỉ lúc login: người
  dùng đổi máy/cập nhật app giữa phiên vẫn được ghi nhận.

## 2. Đọc cấu hình công khai lúc khởi động

**Vì sao:** backend vừa có `GET /config/public`. Trước đó admin bật bảo trì / ép cập nhật
mà app không biết gì — cấu hình chỉ admin tự xem.

### Endpoint

```
GET /api/config/public      (@Public — KHÔNG cần token, KHÔNG bị rate limit)
```

```json
{
  "maintenanceMode": false,
  "maintenanceMessage": "",
  "forceUpdate": {
    "android": { "minVersion": "", "message": "" },
    "ios":     { "minVersion": "", "message": "" }
  },
  "announcement": { "title": "", "body": "", "active": false, "at": null },
  "featureFlags": {}
}
```

### Cách dùng

| Field | Hành vi |
|---|---|
| `maintenanceMode` | Chặn toàn app (trừ màn hình thông báo). Hiện `maintenanceMessage`. |
| `forceUpdate.<platform>.minVersion` | So với version hiện tại; thấp hơn → chặn, hiện `message`. Rỗng = tắt. |
| `announcement` | Chỉ hiện khi `active`. `at` để bỏ qua bản người dùng đã đóng. |
| `featureFlags` | Cờ tuỳ ý do vận hành đặt; chỉ đọc những cờ app biết. |

- Gọi **một lần** lúc khởi động (sau `restoreSession`, trước khi render app), timeout ngắn
  (2–3s), **fail-open**: lỗi mạng thì vào app bình thường. Endpoint này hỏng không được
  chặn người dùng.
- Cache theo TTL ngắn (5–15 phút) hoặc nhớ bản gần nhất trong storage để lần mở sau có
  dữ liệu ngay.
- So sánh version dạng số (`2.0.10 > 2.0.9`), không so chuỗi.

### Lưu ý

- Không dùng `GET /admin/config` — route đó yêu cầu JWT + quyền admin, app sẽ 401/403.
- Không cache vĩnh viễn: tắt bảo trì rồi mà app còn kẹt màn hình bảo trì là sự cố.
- `forceUpdate` là **chặn** (blocking) chứ không phải "nhắc": user không tự đóng được.

---

## 3. Nhận broadcast qua push

**Vì sao:** admin đã sửa broadcast để gửi đúng room và push cho người online-false, nhưng
chỉ với audience "chọn người dùng" (`ids`). App cần xử lý payload tương ứng.

Push có `data.type`:

| `type` | Nguồn |
|---|---|
| `system_broadcast` | Broadcast admin (audience `ids`, người nhận đang offline) |
| `admin_test` | Nút "Gửi thử" ở `/ops-logs` — chỉ dùng để kiểm cấu hình FCM |

Cả hai đều có `notification.title`/`body`. App nên hiện banner/thông báo hệ thống trong
app khi mở từ push. Không cần xử lý navigation đặc biệt — `deepLink` hiện là `koola://home`.

**Chưa cần làm:** `all` / `personal` / `business` hiện **không** push cho người offline
(backend đếm theo socket nên không biết ai offline). Đừng kỳ vọng nhận được push từ ba
audience đó cho tới khi backend có danh sách người nhận.

---

## Ngoài phạm vi (đã ghi ở `admin-web/docs/task1.md`)

- Broadcast có lịch gửi + danh sách người cho nhóm theo loại tài khoản — việc backend.
- Auto-mod assist, lịch sử health — cần schema mới, đi qua OpenSpec trước.
