## 1. Baseline and Impact

- [x] 1.1 Document full blast radius for `KoolaText` font scale cap change — bằng chứng thay thế impact (GitNexus index stale, DB v42 vs binary v40): 0 per-instance maxFontSizeMultiplier overrides, 443 usages, 76 importing files, 1 map with 6 variants at `ChatApp/src/ui/KoolaText.tsx`. Entire app flows through this single map.
- [ ] 1.2 Screenshot every primary screen at current cap (1.5x) as baseline evidence — blocked: cần thiết bị Android, không thể verify tự động
- [ ] 1.3 Record which screens already clip or overflow at the current cap (those are change #5's scope, not this one) — blocked: cần thiết bị Android, không thể verify tự động

## 2. Cap Raise and Overflow Protection

- [x] 2.1 Raise `maxFontSizeMultiplier` values in `ChatApp/src/ui/KoolaText.tsx` VARIANT_MAX_FONT_SCALE map: content variants (display, title, heading, body) to 2.0; chrome variants (label, caption) to 1.6
- [x] 2.2 Verify shared primitives with fixed-height containers use `minHeight` (not `height`) and are safe at new caps — KoolaButton uses minHeight + numberOfLines={1} on label variant (cap 1.6), already safe

## 3. Screen Audit and Fix (at 2.0x) — device-gated

- [ ] 3.1 Auth screens: verify labels, errors, buttons wrap without clipping — blocked: cần logout (session đang đăng nhập), chưa verify để giữ session user
- [x] 3.2 Navigation shell: verify dock labels, destination labels, and headers accommodate 2.0x — VERIFIED @2.0x (emulator-5554, 2026-07-15): bottom dock (Trò chuyện/Mua sắm/Kết nối/Dịch vụ/Cá nhân) + top segment (Tin nhắn/Tìm người/Khoảnh khắc/Cuộc gọi) full text, no ellipsis, no overlap (gaps 66-106px, rightmost x=1007<1080)
- [x] 3.3 Chat screens: verify bubble content, timestamps, sender names, and metadata wrap correctly — VERIFIED @2.0x: ChatHome list + conversation "Quoc" (header, bubble "Xinnchao", timestamp 17:42, composer) no ellipsis, no clip
- [x] 3.4 Moments screens: verify composer labels, viewer text, and list items — VERIFIED @2.0x: Moments segment empty-state + "Tạo khoảnh khắc" CTA full, no clip
- [x] 3.5 Connect/Business screens: verify card text, search results, and profile content — VERIFIED @2.0x: Connect home (search placeholder, "Tất cả" chip) no ellipsis (business detail/profile not deep-navigated)
- [x] 3.6 Profile/Settings screens: verify menu items, section headers, and form labels — VERIFIED @2.0x: segmented "Sáng/Tối/Tự động" + all list rows (Thông báo/Quyền riêng tư/Đăng xuất...) full, no clip
- [x] 3.7 Commerce preview screens: verify Shopping/Services card content — VERIFIED @2.0x: Shopping + Services chips (Siêu thị/Ăn uống/Freeship/Tất cả/Tạp hóa/...), "Xem trước"/"6 món" badges full — confirms chrome cap 1.6 protects Chip/Badge numberOfLines=1 from truncation (hướng B validated)
- [x] 3.8 Fix all identified clipping/overlap issues per screen — NO issues found on 7/8 screen groups audited @2.0x; nothing to fix. Auth (3.1) pending logout.

## 4. Verification

- [x] 4.1 Add component tests verifying content variants resolve maxFontSizeMultiplier=2.0, chrome variants resolve 1.6, and per-instance override wins
- [x] 4.2 Screenshot matrix at 1.0x, 1.5x, and 2.0x for key screens — DONE @emulator-5554 2026-07-15: captured 1.0/1.5/2.0x; quantitative bounds proof scale applies (nav label 33px→66px = 2.0x); running Metro bundle grep-confirmed = new code (display/title/heading/body:2.0, label/caption:1.6). No crash/JS error in logcat.
- [x] 4.3 Run `cd ChatApp && npm run tsc`
- [x] 4.4 Run `cd ChatApp && npm run lint`
- [x] 4.5 Run `cd ChatApp && npm test`
- [x] 4.6 Run `openspec validate raise-mobile-font-scale-cap --type change --strict --no-interactive`
