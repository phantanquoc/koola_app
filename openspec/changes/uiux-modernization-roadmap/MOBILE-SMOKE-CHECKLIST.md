# Checklist Smoke-Test Mobile (User)

> **QUAN TRONG:** Truoc khi test, can REBUILD Android:
> ```bash
> cd ChatApp && npm install && npx react-native run-android
> ```
> Batch nay go native module `@react-native-community/blur` — chi `npm install` KHONG du de go khoi APK. Phai rebuild lai app Android.

---

## Task 3.6 — Moments Entry (MomentsScreen + MomentRing)

### Dieu kien: Dang nhap thanh cong, co it nhat 1 tai khoan ban be.

- [ ] **Empty feed:** Chua co ai dang Moment. Man hinh hien thong bao trong (empty state) voi noi dung ro rang, khong crash.
- [ ] **Own ring — tao moi:** Nhan vao ring "+" (ring cua ban than). Mo MomentComposer. Chon anh/video, them nhac (tuy chon), nhan Dang. Quay ve feed, ring cua minh chuyen sang trang thai "unseen" (vien xanh).
- [ ] **Friend ring — xem:** Nhan vao ring cua ban be co Moment chua xem. MomentViewer mo, hien story, timer chay. Nhan giu (hold) de pause, tha (release) de tiep tuc.
- [ ] **Pull-to-refresh:** Keo xuong tu dau feed. Loading indicator xuat hien, feed reload, khong crash.
- [ ] **Own long-press menu:** Nhan giu ring cua minh. Menu xuat hien (Highlights, Xoa, v.v.). Nhan ngoai menu de dong — menu bien mat.

**Ket qua mong doi:** Tat ca buoc tren hoat dong muot, khong crash, khong loi hien thi.

---

## Task 4.5 — Viewer / Composer / Music Lifecycle

### Dieu kien: Co it nhat 1 Moment da dang (co media), nhac da duoc chon.

- [ ] **Hold-to-pause resume:** Trong MomentViewer, nhan giu man hinh — timer dung, video/nhac pause. Tha ra — tiep tuc tu dung cho, KHONG nhay ve dau.
- [ ] **Close stops media:** Dang xem Moment co nhac/video. Nhan nut dong (X hoac swipe). Xac nhan: am thanh DUNG NGAY, khong tiep tuc phat ngam.
- [ ] **Rapid open/close:** Mo Moment, dong ngay (<1 giay), mo lai, dong lai. Lap 3-4 lan. Khong crash, khong am thanh bi chong (overlay audio).
- [ ] **Preview stops on close/change (Composer):** Trong MomentComposer, chon nhac, preview dang phat. Nhan "Huy" hoac chuyen sang nhac khac. Xac nhan: preview cu DUNG, chi preview moi phat (hoac im lang).
- [ ] **Preview stops on dismiss (MusicPicker):** Mo MusicPicker, bat preview 1 bai. Dong MusicPicker (back/X). Am thanh preview DUNG NGAY.

**Ket qua mong doi:** Khong co audio/video nao tiep tuc phat sau khi dismiss/close bat ky man hinh nao.

---

## Task 5.5 — Chat UX Clarity

### Dieu kien: Co it nhat 1 cuoc hoi thoai voi tin nhan.

- [ ] **Open/back:** Tu danh sach hoi thoai, nhan vao 1 cuoc tro chuyen. Man hinh Chat mo. Nhan Back. Quay ve danh sach — KHONG co flicker/flash trang khi chuyen man hinh.
- [ ] **Keyboard open/close:** Trong Chat, nhan vao o nhap tin nhan. Ban phim mo ra. Nhan Back hoac nhan vung ngoai. Ban phim dong — layout khong nhay/giat.
- [ ] **Send responsiveness:** Go tin nhan, nhan Gui. Tin nhan xuat hien ngay trong danh sach (trang thai "dang gui" tick xam). Sau do chuyen "da gui" (tick don) hoac "da nhan" (tick kep).
- [ ] **Failed-bubble retry:** Bat che do may bay (offline). Gui 1 tin nhan. Tin nhan hien voi trang thai loi (bubble do/cam, "Nhan de thu lai"). Bat lai mang. Nhan vao bubble loi. Tin nhan duoc gui lai thanh cong.
- [ ] **Khong pop-back flicker:** Mo Chat, nhan Back 5-6 lan lien tuc (nhanh). Man hinh khong flash trang/nhap nhay. Xac nhan `freezeOnBlur` van hieu luc.

**Ket qua mong doi:** Chat hoat dong binh thuong, khong regression tu cac thay doi UI truoc do. ChatComposer van la uncontrolled input (go tieng Viet voi IME khong bi mat dau/loi).

---

## Task 8.4 — Release-like Smoke Test (Chat + Moments Media)

### Dieu kien: App da rebuild, co tai khoan voi du lieu (hoi thoai, Moments co media).

**Chat media:**
- [ ] **Gui anh:** Chon anh tu thu vien, gui. Anh hien trong bubble, co thong bao "dang gui", roi hoan tat.
- [ ] **Gui video:** Chon video ngan (<15s), gui. Video upload thanh cong, hien trong bubble.
- [ ] **Nhan anh/video:** Yeu cau ban be gui anh/video. Xac nhan hien thi dung, co the xem full-screen.

**Moments media:**
- [ ] **Dang Moment voi video:** Tao Moment moi, chon video. Them nhac (tuy chon). Dang. Video duoc upload thanh cong.
- [ ] **Dang Moment voi anh:** Tao Moment moi, chon anh. Dang. Anh hien thi dung trong ring cua minh.
- [ ] **Xem Moment co video + nhac:** Mo Moment ban be co video va nhac. Ca hai phat dong thoi, am luong nhac nho hon video (neu co am video).
- [ ] **Background/foreground:** Dang xem Moment, nhan Home (app vao background). Quay lai app — Moment van o man hinh viewer, tiep tuc tu cho dung (hoac reset ve dau — chap nhan ca hai). KHONG co am thanh phat ngam khi app o background.

**Ket qua mong doi:** Moi media flow (gui, nhan, dang, xem) hoat dong on dinh. Khong crash, khong leak audio.

---

## Ghi chu

- Neu gap loi, ghi lai: man hinh nao, buoc nao, ket qua thuc te vs ket qua mong doi.
- Sau khi hoan tat tat ca check, tick `[x]` vao task tuong ung trong `openspec/changes/uiux-modernization-roadmap/tasks.md`.
- Cac task 3.6, 4.5, 5.5, 8.4 chi duoc tick khi DA TEST THUC TE tren thiet bi.
