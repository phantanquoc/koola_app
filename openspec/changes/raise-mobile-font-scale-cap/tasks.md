## 1. Baseline and Impact

- [x] 1.1 Document full blast radius for `KoolaText` font scale cap change — bằng chứng thay thế impact (GitNexus index stale, DB v42 vs binary v40): 0 per-instance maxFontSizeMultiplier overrides, 443 usages, 76 importing files, 1 map with 6 variants at `ChatApp/src/ui/KoolaText.tsx`. Entire app flows through this single map.
- [ ] 1.2 Screenshot every primary screen at current cap (1.5x) as baseline evidence — blocked: cần thiết bị Android, không thể verify tự động
- [ ] 1.3 Record which screens already clip or overflow at the current cap (those are change #5's scope, not this one) — blocked: cần thiết bị Android, không thể verify tự động

## 2. Cap Raise and Overflow Protection

- [x] 2.1 Raise `maxFontSizeMultiplier` values in `ChatApp/src/ui/KoolaText.tsx` VARIANT_MAX_FONT_SCALE map: content variants (display, title, heading, body) to 2.0; chrome variants (label, caption) to 1.6
- [x] 2.2 Verify shared primitives with fixed-height containers use `minHeight` (not `height`) and are safe at new caps — KoolaButton uses minHeight + numberOfLines={1} on label variant (cap 1.6), already safe

## 3. Screen Audit and Fix (at 2.0x) — device-gated

- [ ] 3.1 Auth screens: verify labels, errors, buttons wrap without clipping — blocked: cần thiết bị Android, không thể verify tự động
- [ ] 3.2 Navigation shell: verify dock labels, destination labels, and headers accommodate 2.0x — blocked: cần thiết bị Android, không thể verify tự động
- [ ] 3.3 Chat screens: verify bubble content, timestamps, sender names, and metadata wrap correctly — blocked: cần thiết bị Android, không thể verify tự động
- [ ] 3.4 Moments screens: verify composer labels, viewer text, and list items — blocked: cần thiết bị Android, không thể verify tự động
- [ ] 3.5 Connect/Business screens: verify card text, search results, and profile content — blocked: cần thiết bị Android, không thể verify tự động
- [ ] 3.6 Profile/Settings screens: verify menu items, section headers, and form labels — blocked: cần thiết bị Android, không thể verify tự động
- [ ] 3.7 Commerce preview screens: verify Shopping/Services card content — blocked: cần thiết bị Android, không thể verify tự động
- [ ] 3.8 Fix all identified clipping/overlap issues per screen — blocked: cần thiết bị Android, không thể verify tự động

## 4. Verification

- [x] 4.1 Add component tests verifying content variants resolve maxFontSizeMultiplier=2.0, chrome variants resolve 1.6, and per-instance override wins
- [ ] 4.2 Screenshot matrix at 1.0x, 1.5x, and 2.0x for key screens — blocked: cần thiết bị Android, không thể verify tự động
- [x] 4.3 Run `cd ChatApp && npm run tsc`
- [x] 4.4 Run `cd ChatApp && npm run lint`
- [x] 4.5 Run `cd ChatApp && npm test`
- [x] 4.6 Run `openspec validate raise-mobile-font-scale-cap --type change --strict --no-interactive`
