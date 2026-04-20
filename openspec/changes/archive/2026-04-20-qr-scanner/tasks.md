## 1. Dependencies

- [x] 1.1 Install `react-native-vision-camera`, `react-native-worklets-core`, `react-native-qrcode-svg`, and `react-native-svg` in ChatApp
- [x] 1.2 Rebuild Android app to link native scanner module ← (verify: app builds and runs without crashes after adding native deps)

## 2. QR Scanner Modal — Shell

- [x] 2.1 Create `ChatApp/src/screens/main/QrScannerModal.tsx` with fullscreen Modal, close button, and Material Top Tabs ("Quét QR" / "Mã QR của tôi") wrapped in an independent NavigationContainer
- [x] 2.2 Wire `onQrPress` in `ChatHomeScreen.tsx` to open the QrScannerModal (pass `visible` + `onClose` + navigation ref)

## 3. QR Scanner Tab — Camera & Permission

- [x] 3.1 Implement camera permission request flow: check → request → handle granted/denied
- [x] 3.2 Show scanner camera viewfinder when permission is granted using `react-native-vision-camera`
- [x] 3.3 Show alert with "Cần quyền camera" + "Mở Cài đặt" button (calls `Linking.openSettings()`) when permission is denied

## 4. QR Scanner Tab — Scan Processing

- [x] 4.1 On QR detected: validate scanned value is a 24-char hex string (MongoDB ObjectId regex)
- [x] 4.2 Show alert "Mã QR không hợp lệ" if format is invalid
- [x] 4.3 Show alert "Bạn không thể quét mã của chính mình" if scanned userId === currentUserId
- [x] 4.4 Call `usersApi.searchUsers(scannedUserId)` to verify user exists; show alert "Không tìm thấy người dùng" if not found
- [x] 4.5 Show action alert with user's displayName and 3 buttons: "Xem hồ sơ", "Nhắn tin", "Hủy" ← (verify: all 5 scan scenarios from spec work correctly — valid user, self-scan, invalid format, user not found, and successful actions)

## 5. Post-Scan Actions

- [x] 5.1 "Xem hồ sơ": close modal → navigate to `Profile` screen with `{ userId: scannedUserId }`
- [x] 5.2 "Nhắn tin": close modal → call `conversationsApi.startDirectChat(scannedUserId)` → navigate to `Chat` screen with conversation ID
- [x] 5.3 "Hủy": dismiss alert, resume scanning

## 6. My QR Code Tab

- [x] 6.1 Display current user's avatar (using existing `UserAvatar` component) and displayName
- [x] 6.2 Render QR code image encoding `currentUser._id` using `react-native-qrcode-svg`
- [x] 6.3 Show fallback message "Không thể tải mã QR" if user data is unavailable ← (verify: QR code is scannable by another device, tab displays correctly with avatar + name + QR)
