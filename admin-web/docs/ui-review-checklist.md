# Checklist rà soát UI — admin-web

Dùng cho **mọi trang trong `src/pages/`** trước khi báo done. Mỗi mục đều kiểm được
bằng mắt hoặc bằng lệnh grep ở §7 — không phải "cảm thấy ổn".

Bổ trợ cho `DESIGN.md`: DESIGN nói *hình thức* (kit nào, archetype nào), tài liệu này
nói *hành vi* (ô nào nhập gì, nhóm nào đứng trước, chữ nào hiện ra khi rỗng).
Mâu thuẫn giữa hai file → sửa cả hai trong cùng PR.

---

## 0. Cách dùng

1. Mở trang, chạy §7 để lấy danh sách vi phạm tự động.
2. Đi từng mục A→F, mỗi mục tick hoặc ghi lý do bỏ qua.
3. Đối chiếu bảng nợ §8 — nếu trang nằm trong bảng thì sửa theo đúng thứ tự P0 → P3.

Ba câu hỏi phải trả lời được cho **từng ô nhập** trên trang:

- Người vận hành **gõ cái gì**? (chuỗi tự do / số / ngày / chọn từ danh sách)
- **Sai thì biết lúc nào**? (lúc gõ / lúc rời ô / lúc bấm Lưu / sau khi server trả lỗi)
- **Sai thì sửa thế nào**? (thông điệp nói đúng thứ cần sửa, không nói "không hợp lệ")

Trả lời không được → ô đó đang bắt người dùng đoán.

---

## A. Ô nhập — đúng loại dữ liệu, đúng điều khiển

Nguyên tắc gốc: **điều khiển hẹp nhất mà vẫn đủ biểu đạt**. Không cho gõ thứ mà
máy đã biết; không bắt nhớ thứ máy tra được.

### A1. Bảng quyết định theo loại dữ liệu

| Dữ liệu | Điều khiển | Ràng buộc bắt buộc | Ghi chú |
|---|---|---|---|
| Tiền VND (giá, hoàn tiền, hoa hồng) | `<MoneyInput>` | `parseVnd()` ra số nguyên; `≥ 0`; hoàn tiền `≤ tổng đơn` | Hiện `1.234.567`, placeholder `89.000`. Không hiện "đ" trong ô — đơn vị ở label |
| SĐT Việt Nam | `<PhoneInput>` | `VN_PHONE` trên giá trị đã `normalizeVnPhone()` | Gõ `091 234 5678`, lưu `0…`. Cố định 11 số cũng hợp lệ (backfill có sẵn) |
| Mã số thuế | `<IntegerInput maxLength={13}>` | `^\d{10}(\d{3})?$` | Chỉ chữ số; 10 hoặc 13 |
| Ngày | `<input type="date">` | Có `min`/`max` khi có mốc đối chiếu; không nhận chuỗi tự do | `31/02` phải không gõ được, không phải báo lỗi sau round-trip |
| Khoảng ngày | 2 `type="date"` + preset + cảnh báo đảo | `from ≤ to`; preset Hôm nay / 7 / 30 / Tháng này | Mẫu: `ExportDateRange.tsx` |
| Email | `type="email" inputMode="email"` | Regex trước khi gửi (không đợi server) | `spellCheck={false}`, `autoComplete="off"` khi sửa email người khác |
| URL | `type="url" inputMode="url"` | Kiểm scheme `http/https` trước khi gửi | Không prefill URL giả |
| Phiên bản app (`2.1.0`) | `text` + `inputMode="decimal"` + `list=<datalist>` | Lọc `[^0-9.]`; `^\d{1,4}(\.\d{1,4}){0,3}$` | Gợi ý **từ dữ liệu thật** (`/admin/client-versions`) + hiện hệ quả "chặn N người" |
| Người dùng / chủ tài khoản / người nhận (id) | `<UserPicker>` | Chọn từ kết quả server, không gõ id | §5.1b DESIGN. `max` khi chỉ cần 1 |
| Doanh nghiệp / seller | `<select>` nạp từ API | Hiện tên + nhãn; giữ lựa chọn hiện tại kể cả khi đã hết hợp lệ | `sellerOptions` trong ProductsPage là mẫu đúng |
| Enum (trạng thái, loại, license, kind) | `<select>` | Một nguồn nhãn tiếng Việt | **Cấm** ô text cho enum — xem nợ P1 §8 |
| Tỉ lệ % (hoa hồng) | `text inputMode="decimal"` | Parse dấu `,`/`.`; clamp `0..100`; lưu `rate = pct/100` | Nhãn ghi `(%)`, giá trị không kèm `%` |
| Số nguyên có đơn vị (thời lượng ms) | `<IntegerInput>` | Chỉ chữ số + `maxLength` | Kèm hint quy đổi `≈ 3:00` |
| Chuỗi ngắn (tên, tiêu đề, tag) | `text` | `maxLength` khớp DTO + counter `n/max` | Trim khi gửi |
| Nội dung dài (> ~120 ký tự) | `<textarea>` | `maxLength` + counter | **Cấm** `<input>` một dòng cho nội dung 1000–2000 ký tự |
| Mật khẩu | `type="password"` + nút hiện/ẩn | `autoComplete="current-password"`, `aria-label` cho nút | Mẫu: `LoginPage` |
| OTP 6 số | `text inputMode="numeric"` | `maxLength={6}`, lọc `\D`, `autoComplete="one-time-code"` | Mẫu: `TwoFactorPanel` |
| Không bao giờ | `type="number"` | — | Cho gõ `e`, `+`, `-`; mất số 0 đầu; hiện spinner |

### A2. Quy tắc placeholder

- Placeholder là **ví dụ thật đúng định dạng đã hiển thị**: `89.000`, `091 234 5678`,
  `Công ty TNHH Koola` — không phải `89000`, không phải `24-char ObjectId`.
- **Cấm placeholder giả**: `https://example.com/...`, `VD: ...` lặp lại ở mọi ô.
- Placeholder **không thay label**. Label luôn hiện; placeholder biến mất khi gõ.

### A3. Ràng buộc phải kiểm **trước** khi gửi

Mỗi ô có luật thì luật đó chạy ở client và báo cạnh ô; server vẫn kiểm lần nữa.
Hiện chưa đều:

| Trang | Đang kiểm ở client | Thiếu |
|---|---|---|
| `BusinessCreateForm` | tên, email, SĐT, MST | — (mẫu chuẩn) |
| `CommerceProductsPage` | tên, giá, giá gốc, seller, category | tag quá dài/trùng |
| `CommerceServicesPage` | tên, giá | mô tả quá dài |
| `MusicCatalogPage` | chỉ 3 field bắt buộc bằng toast | ngày, URL, `durationMs > 0` (DTO `@Min(1)`) |
| `UserDetail` (sửa field) | chỉ `displayName` không rỗng | email sai định dạng, SĐT sai `VN_PHONE` → round-trip 400 |
| `BusinessDetailDrawer` (sửa field) | `displayName ≥ 2` | MST, SĐT, email, URL, `commissionRate` ngoài `0..100` |
| `ConfigPage` | version, cờ, độ dài | `announcement` bật nhưng tiêu đề rỗng |
| `BroadcastPage` | tiêu đề/nội dung không rỗng | — |
| `CommerceOrdersPage` (hoàn tiền) | số nguyên, `1..total` | — (mẫu đúng) |

**Luật chung:** nếu server có `@Min/@Max/@MaxLength/@Matches` thì client phải có
luật tương đương **hoặc** phải chứng minh ô đó không gõ sai được (đã bị điều khiển
chặn). `IntegerInput` chặn chữ → không cần báo lỗi "phải là số".

---

## B. Nhóm thông tin & thứ tự

### B1. Thứ tự nhóm = thứ tự câu hỏi của người quyết định

Với hồ sơ cần duyệt, người duyệt tự hỏi theo trình tự sau — form phải xếp y vậy:

```
1. Đây là ai?          → Định danh (tên, danh mục, mô tả ngắn)
2. Liên hệ được không? → Liên hệ (email, sĐT, địa chỉ, website)
3. Có pháp lý không?   → Pháp lý (MST, giấy phép, ảnh)
4. Ai đang xử lý?      → Vận hành (phụ trách, hoa hồng)
5. Ghi chú nội bộ      → luôn cuối, luôn ghi rõ "chỉ admin thấy"
```

`BusinessCreateForm` và `BusinessDetailDrawer#FIELD_GROUPS` đã đúng thứ tự này.
Trang mới copy đúng thứ tự, đừng xếp theo thứ tự field trong schema.

### B2. Bố cục trong một nhóm

| Loại field | Cột |
|---|---|
| Field dài (địa chỉ, mô tả, email, SĐT, URL) | 1 cột full-width |
| Cặp ngắn có quan hệ (giá / giá gốc, từ ngày / đến ngày) | 2 cột cạnh nhau |
| Field phụ thuộc (MST + ngày hết hạn giấy phép) | cùng hàng |
| Field bắt buộc | lên trước trong nhóm |
| Field chỉ đọc / hệ thống sinh | cuối nhóm hoặc trong `details` "Chi tiết kỹ thuật" |

### B3. Dấu hiệu bắt buộc

- Nhãn field bắt buộc: `<span className="form-required">*</span>` **và** `aria-required`
  trên chính input (hiện chỉ 2 file có `aria-required`).
- Nút submit **không** bị disable vì field trống khi chưa bấm lần nào — người dùng
  phải bấm được để thấy lỗi. Ngoại lệ: khi `busy`.
- Field tuỳ chọn phải nói rõ là tuỳ chọn ở label (`(tùy chọn)`) khi đa số field khác
  là bắt buộc — đừng để người dùng đoán.

### B4. Thứ tự đọc & tab

- DOM order = thứ tự thị giác. Không `tabIndex` dương.
- Nhóm phải có tên đọc được: `<section aria-label="Liên hệ">` + heading nhìn thấy.
- Trong bảng sửa inline: Tab đi qua các field theo hàng; Enter lưu, Esc huỷ (đã có).

---

## C. Title & copy

### C1. Công thức

| Vị trí | Công thức | Ví dụ đúng | Sai |
|---|---|---|---|
| List header | `{Danh từ số nhiều}` + count inline | `Người dùng 116` | `Quản lý người dùng` |
| Detail | `{Tên bản ghi}` + badge trạng thái cạnh | `Công ty TNHH Koola` + `Chờ duyệt` | `Chi tiết doanh nghiệp` |
| Dialog form | `Tạo {đối tượng}` / `Sửa {đối tượng}` | `Tạo sản phẩm` | `Thêm mới` |
| Dialog confirm | `{Động từ} {đối tượng}?` | `Xoá hồ sơ doanh nghiệp?` | `Bạn có chắc chắn?` |
| Nút | `{Động từ} {đối tượng}`, ≤4 từ | `Duyệt hồ sơ` | `OK`, `Xác nhận` |
| Empty | nêu vì sao trống + lối thoát | `Chưa có hồ sơ nào. Hồ sơ xuất hiện khi doanh nghiệp đăng ký.` | `Không có dữ liệu` |

### C2. Ba lỗi copy phải tuyệt đối tránh

1. **Copy tả hành vi cũ.** Câu mô tả phải khớp code hiện tại. Hai chỗ đang sai (P1 §8):
   cảnh báo broadcast "server chưa lọc theo loại tài khoản" (server đã lọc) và
   "hạn cấm không tự hết" (cron 15 phút đã có).
2. **Báo số field đã lưu khi server có thể bỏ qua field.** Phải đọc response.
3. **Trộn tiếng Anh không cần.** `Resolve/Dismiss`, `Seller ID`, `Buyer ID`,
   `Rate limit`, `Health`, `Broadcast` — thuật ngữ giữ nguyên chỉ khi đã quen
   (CSV, ID, SLA, 2FA, FCM).

### C3. Danh từ đơn vị trong phân trang

`Pagination` mặc định ghi `hồ sơ` — đúng cho doanh nghiệp, **sai** cho người dùng,
đơn hàng, báo cáo, audit log, tin nhắn. Mọi trang list phải truyền `label`
(mẫu: `AppealsPage`, `OpsLogPage`).

### C4. Đơn vị & định dạng giá trị hiển thị

| Dữ liệu | Hiển thị | Không hiển thị |
|---|---|---|
| Tiền | `250.000đ` | `250000`, `250,000` |
| Số đếm | `1.234` (vi-VN) | `1234` |
| Ngày | `28/10/2026` | `2026-10-28` |
| Ngày + giờ | `28/10/2026 14:30` khi giờ quan trọng | luôn kèm giờ khi chỉ cần ngày |
| Thời lượng | `3:00` (phút:giây) | `180000` |
| Khoảng | `22/10 → 28/10 · 7 ngày` | hai ô ngày trần |
| Rỗng | `—` | `0`, `null`, `undefined` |

---

## D. Hành vi người dùng

### D1. Gõ & tìm

- Ô search chính: debounce **300–400ms thống nhất** (hiện 350 ở Users/Audit, 400 ở
  Businesses/OpsLog — chọn một số), Enter chốt ngay, `/` focus (Conversations đã có).
- Đổi filter/tab **không** xoá chữ đang gõ dở trong ô search của bộ lọc khác.
- Filter/sort/page nằm trong URL → copy link mở đúng view (đã có `useUrlFilters`
  ở 13 trang; 4 trang còn lại đang dùng `useState`).

### D2. Không mất dữ liệu

| Tình huống | Bắt buộc |
|---|---|
| Sửa nhiều field rồi đóng modal | Đếm "N thay đổi chưa lưu" ở bottombar + confirm khi đóng |
| Rời trang khi đang sửa | `beforeunload` khi có thay đổi (UserDetail đã có) |
| Đổi tab/bộ lọc khi đang sửa | Chặn hoặc cảnh báo |
| Đang lưu | Chặn double-submit (`busy`), disable nút, đổi nhãn `Đang lưu…` |
| Lỗi server | Giữ nguyên dữ liệu đã nhập, hiện message server — **không** reset form |
| Đóng modal khi có ảnh đang upload | Chặn cho tới khi upload xong hoặc huỷ rõ ràng |

### D3. Phản hồi sau thao tác

- Toast nêu **tên đối tượng**, không nêu số: `Đã duyệt Công ty A.` không phải
  `Đã duyệt 1 hồ sơ.`
- Hành động không hoàn tác được (broadcast, xoá cứng) → copy nói rõ + confirm
  mạnh (`requireText`).
- Hành động hoàn tác được → toast có lối quay lại (tab Lưu trữ, nút Bỏ cấm).
- Sau mutation: invalidate đúng query key (list + detail + stats), không refetch
  toàn bộ trang.
- Lỗi một phần khi bulk: `Đã duyệt 4/6 hồ sơ. Lỗi: đã xử lý; không tìm thấy (+1)`.

### D4. Bàn phím

- Enter = hành động chính của form; Esc = huỷ/đóng; `Cmd/Ctrl+Enter` = lưu ở textarea.
- Dialog: focus vào phần tử đầu, trap bên trong, trả focus về nút đã mở (Dialog đã có).
- Menu/popover: ↑/↓ di chuyển, Enter chọn (UserPicker đã có; Conversations filter
  popover thì chưa).
- Bảng: `J/K` di chuyển hàng, `Enter` mở, `Space` chọn (queue).

### D5. Trạng thái tải & rỗng

- Loading: skeleton giữ nguyên toolbar/header để không nhảy layout.
- Rỗng thật vs rỗng do lọc: hai câu khác nhau, cái sau có nút "Xoá bộ lọc".
- Lỗi tải: `StateBlock variant="error"` + Thử lại — không dùng variant empty cho lỗi.
- Ô đang tìm: hiện trạng thái "đang tìm" trong danh sách, không để trống trơn.

---

## E. Hiển thị dữ liệu thông minh

### E1. Bảng

- **Số canh phải, chữ canh trái**, header của cột số cũng canh phải. Hiện chỉ
  `/revenue` và `/ratelimit` có class canh phải — các bảng khác đang canh trái.
- Đơn vị trong header (`Giá (VND)`, `Thời lượng`), không lặp trong từng ô.
- `0` và `—` khác nhau: `0` là số thật, `—` là không có dữ liệu.
- Cột không đọc được ở đâu = **dead field** → bỏ hoặc hiện (xem nợ P1 §8).
- Hàng cảnh báo: viền trái tone, không tô cả hàng.

### E2. Không hiện dữ liệu thô (§3B2 DESIGN)

ObjectId, JSON, slug, enum, ms, giá trần, IP nội bộ → dịch hoặc ẩn sau
`details` "Chi tiết kỹ thuật".

### E3. PII

- SĐT/email che mặc định qua `MaskedPII`, bấm mới hiện, tự che lại sau 30s.
- CSV/export: confirm nêu rõ **file chứa PII không che** + cap 500.

### E4. Thông tin phải xuất hiện cùng nhau

Người dùng không nên phải mở 3 chỗ để quyết định một việc. Kiểm mỗi màn hình
chi tiết: có đủ **ai · đang ở trạng thái nào · vì sao · ai đã làm gì · tiếp theo
làm gì** chưa. Thiếu một phần → thêm block, không thêm tab.

---

## F. A11y & an toàn

- Mọi input có `label htmlFor` (hoặc `aria-label` khi không có label hiển thị).
- Lỗi cạnh field có `role="alert"` + `aria-describedby` trỏ đúng id lỗi.
- Ảnh/icon-only button: `aria-label` + `title`.
- Bảng có `<th scope="col">` (đã đủ 18 trang).
- Focus visible (đã có `:focus-visible` toàn cục) — kiểm bằng Tab thật.
- `prefers-reduced-motion` (đã có 2 block) — animation mới phải nằm trong block đó.
- Không có `dangerouslySetInnerHTML` với dữ liệu người dùng.
- URL người dùng nhập không được render thẳng vào `href` mà thiếu kiểm scheme.
- `<html lang="vi">` và `<title>` đúng ngôn ngữ — sai `lang` là screen reader đọc
  tiếng Việt bằng giọng tiếng Anh.

### F2. Typography tiếng Việt (luật riêng, xem DESIGN §10.1)

- **Không `text-transform: uppercase`** cho chuỗi tiếng Việt ở cỡ < 14px. Chữ hoa
  mang dấu (Ấ/Ộ/Ỹ) mất nét phân biệt. Chỉ giữ cho chuỗi ASCII thuần.
- `letter-spacing` âm tối đa **−0.01em** trên heading.
- `line-height` ≥ **1.15** cho heading lớn (hero 42px). 1.05 làm dấu hai tầng
  chồng lên dòng dưới.
- Cỡ chữ nhỏ nhất cho nhãn có dấu: **11px**.
- Font phải có subset `vietnamese`: kiểm `document.fonts.check('700 12px Inter', 'ễ ộ ạ Đ')`.

```bash
# F2. Uppercase trên nội dung tiếng Việt
grep -rn "text-transform: uppercase" src/ | grep -v node_modules
# Mỗi kết quả phải là chuỗi ASCII (env-banner "DEV · Koola Admin"), không phải nhãn tiếng Việt
grep -rn 'lang="' index.html
```

---

## 7. Lệnh kiểm tự động

```bash
cd admin-web/src

# A. Ô nhập sai loại
grep -rn 'type="number"' pages components | grep -v __tests__
grep -rn 'placeholder="[^"]*ObjectId' pages components
grep -rn 'example\.com' pages components

# A1. Field có cấu trúc phải dùng component — liệt kê input KHÔNG khai `type`
#     (khai thiếu type = trình duyệt coi là text: sai bàn phím trên mobile)
python3 - <<'PY'
import re, glob
bad = []
for f in glob.glob('pages/*.tsx') + glob.glob('components/*.tsx'):
    s = open(f).read()
    for m in re.finditer(r'<input\b[^>]*>', s, re.S):
        if re.search(r'\btype="', m.group(0)):
            continue
        bad.append(f'{f}:{s[:m.start()].count(chr(10)) + 1}')
print(f'{len(bad)} input thiếu type')
print('\n'.join(bad))
PY

# A. Input một dòng cho nội dung dài
grep -rn 'maxLength={[0-9]\{3,\}}' -B3 pages components | grep '<input'

# B. Dấu bắt buộc
grep -rn 'form-required' pages components | wc -l
grep -rn 'aria-required' pages components | wc -l

# C. Trang list phải dùng ListHeader (PageHeader chỉ hợp lệ ở Analytics, Health,
#    Revenue, Config, Broadcast, Forbidden)
grep -rn '<PageHeader' pages | grep -vE 'Analytics|Health|Revenue|Config|Broadcast|Forbidden'

# C3. Pagination thiếu `unit` (mỗi trang một danh từ, không dùng mặc định)
for f in pages/*.tsx; do
  grep -q '<Pagination' $f || continue
  awk '/<Pagination/,/onPageChange|selectPage/' $f | grep -q 'unit=' || echo "thiếu unit: $f"
done

# D. Trang list phải có search
for f in pages/*.tsx; do grep -q 'useAdminList\|<Pagination' $f && ! grep -q 'type="search"' $f && echo "thiếu search: $f"; done

# E. Inline style (cấm ở trang mới)
grep -rc 'style={{' pages components | grep -v ':0'

# F. a11y
grep -rn '<th ' pages | grep -v 'scope='
grep -rn '<label className="form-label"' pages components | grep -v htmlFor

# Chốt
npx vitest run && npx tsc --noEmit && npx vite build
```

---

## 8. Nợ UI — trạng thái sau đợt rà 2026-10-28

Mức: **P0** sai/làm mất dữ liệu · **P1** nói sai với người dùng · **P2** lệch chuẩn
DESIGN · **P3** trau chuốt.

### Đã sửa trong đợt này

| Mức | Chỗ | Đã sửa |
|---|---|---|
| P0 | `MusicCatalogPage` | `Track` khai `licenseUrl`/`sourceUrl`; `openEdit` giữ URL thật (trước đây ghi đè `example.com` → **mỗi lần Sửa là xoá dữ liệu pháp lý**); form khởi tạo rỗng, `type="url"` + kiểm `http(s)`; kiểm `durationMs > 0`; bảng hiện `3:00` thay `180s` và nhãn giấy phép thay slug |
| P1 | `BroadcastPage` | Bỏ cảnh báo "server chưa lọc theo loại tài khoản" (sai từ `cd27185`); thay bằng copy đúng: chỉ người đang online nhận, người offline cần "Chọn người dùng" |
| P1 | `UserModeration`, `UserDetail`, `user-labels`, `formatters` | "Hạn cấm không tự hết" → "Hết hạn sẽ tự gỡ trong vòng 15 phút" (`AdminUnbanCron` chạy `*/15 * * * *`) |
| P1 | `BusinessDetailDrawer` | `commissionRate` vào nhóm "Vận hành" — trước đây có trong `EDIT_ORDER`/`EDIT_LABELS` nhưng **không render ở đâu** (dead field); thêm hàm `fieldError()` kiểm tên/email/SĐT/MST/website/hoa hồng cho cả sửa-từng-field và sửa-hàng-loạt; SĐT gửi dạng chuẩn hoá |
| P1 | `Pagination` | `label?` → **`unit` bắt buộc**; cả 13 trang truyền danh từ đúng (người dùng / doanh nghiệp / đơn hàng / sản phẩm / dịch vụ / báo cáo / lượt thao tác / tin nhắn / story / track / kháng nghị / lượt gửi / lần gửi) |
| P2 | `CommerceOrdersPage` | `Seller ID`/`Buyer ID` (ObjectId 24 ký tự) → 2 `UserPicker`; `PageHeader` → `ListHeader`; lọc áp dụng ngay, bỏ nút "Lọc" |
| P2 | `CommerceProductsPage`, `MusicCatalogPage` | `PageHeader` → `ListHeader` + count |
| P2 | `OpsLogPage` | "Loại push" text → `datalist` với 4 kind thật; nội dung push thử `input` → `textarea` |
| P2 | `AuditLogPage`, `OpsLogPage` | Ô ngày có `min`/`max` đối ứng — không chọn được khoảng ngược |
| P2 | `UserDetail` | `saveField` kiểm username/email/SĐT theo đúng `UpdateUserDto`; SĐT gửi dạng chuẩn hoá |
| P2 | `ConfigPage` | Bật thông báo mà thiếu tiêu đề/nội dung → lỗi tại chỗ + `aria-required` |
| P2 | Bảng orders/products/services | Thêm `.col-num` (canh phải + `tabular-nums`); giá gốc gạch ngang bằng class thay inline style |
| P1 | `AppLayout` topbar (mobile ≤860px) | Badge 2FA + sức khỏe tràn sang trái và **đè lên nút hamburger** — `elementFromPoint(40,67)` trả về badge, drawer không mở được. Thu badge về icon 32px, chữ ẩn bằng `.sr-only` |
| P1 | `AppLayout` topbar | `Hệ thống: degraded` — enum tiếng Anh lộ ra UI. Dịch `degraded`→"Suy giảm", `error`→"Sự cố"; degraded dùng tone warning thay vì danger |
| P1 | `AppLayout` sidebar | 21 mục / cao 1178px, màn 768–900px chỉ thấy 13 → mở `/ratelimit` thì mục active nằm ngoài khung. Tự `scrollIntoView` mục active + scrollbar mảnh + `scroll-padding` |
| P1 | `AppLayout` identity chip | `<div>` có hover nhưng không bấm được, trong khi đây là chỗ duy nhất mở 2FA của chính admin → đổi thành `<Link>` tới `/users/:id` |
| P1 | `AppLayout` mobile drawer | Backdrop có `onKeyDown` nhưng không bao giờ focus → Esc không đóng; mở drawer không focus vào nav. Thêm listener `document` + focus mục active + trả focus về nút mở |
| P2 | `AppLayout` sidebar | Nhãn trộn Anh/Việt (`Dashboard`, `Reports`, `Products`, `Health`, `Rate limit`, `Audit log`…). Việt hoá hết (nhóm "Catalog" → "Bán hàng"), giữ alias tiếng Anh trong `NavItem.aliases` để palette vẫn khớp |
| P2 | `AppLayout` sidebar | Breadcrumb ghi "Quản lý người dùng" trong khi H1 ghi "Người dùng" → breadcrumb dùng đúng nhãn trang |
| P2 | `AppLayout` sidebar | Không có tín hiệu việc đang chờ → badge `pendingVerification` trên mục Doanh nghiệp (không badge khi 0), chấm góc khi rail thu gọn |
| P2 | `CommandPalette` | Trang tự bắt `/` (Conversations) → một phím mở cả palette lẫn focus ô search. Palette bỏ qua khi `e.defaultPrevented` |
| — | `README.md`, `DESIGN.md` | Trỏ tới tài liệu này từ mục Tài liệu và §5.1; DESIGN §2 cập nhật shell mới |

### Còn lại (theo thứ tự nên làm)

| Mức | # | Chỗ | Vấn đề |
|---|---|---|---|
| P2 | 1 | 9 trang list chưa có ô tìm kiếm: Reports, Orders, Products, Services, Music, Moments, OpsLog, Appeals, ModerationQueue | Người vận hành phải cuộn tay. Phần lớn server chưa có `q` — thêm DTO + filter trước, rồi thêm ô |
| P2 | 2 | `CommerceOrdersPage`, `CommerceProductsPage` (còn ~30 + ~20 chỗ) | Inline `style={{}}` — chuyển sang class trong `commerce-admin.css` |
| P2 | 3 | `CommerceProductsPage:534`, `CommerceServicesPage:50`, `BusinessCreateForm:49` | Ba bản `Field` khác nhau (`-err` vs `-error`, hai kiểu hiển thị hint) → gom `FormField` dùng chung |
| P2 | 4 | `CommerceOrdersPage` | Bộ lọc bảng chưa có khoảng ngày dù server đã hỗ trợ `from`/`to` và dialog export có → không xem trước được tập sắp xuất |
| P2 | 5 | `SearchInput.tsx` | Component chết (không nơi nào import) → xoá, hoặc dùng thay 4 khối search chép tay |
| P2 | 6 | `ConversationsPage:621-645` | Popover lọc dựng tay bằng inline style + checkbox thô → dùng `FilterPopover` |
| P3 | 7 | `CommerceProductsPage`/`Services`/`Music` | Thiếu chọn số dòng/trang dù `Pagination` đã hỗ trợ `pageSizes` |
| P3 | 8 | Orders / Products / Music | `useState` + `useEffect` fetch tay thay `useUrlFilters` + `useAdminList` → reload mất view, không share link |
| P3 | 9 | Ngoài Businesses/Users | Không sort được dù server có whitelist sort |
| P3 | 10 | 4 trang list | Debounce không thống nhất: 350ms (Users, Audit) vs 400ms (Businesses, OpsLog) |
| P3 | 11 | `ConversationsPage` | Tự bắt `/` để focus ô tìm — giờ palette nhường nhờ `defaultPrevented`, nhưng phím tắt riêng của trang vẫn nên thống nhất về `/` = palette, `f` = ô tìm |

---

## 9. Thứ tự sửa đề nghị

```
P0/P1 đã xong  →  P2 còn lại (search server-side, gom Field, inline style)
               →  P3 (đồng bộ hành vi, URL state, nhãn điều hướng)
```

Mỗi bước chốt bằng §7. Không gộp hai mức vào một commit — P0/P1 phải review được
riêng, vì chúng đổi thứ người dùng đọc.
