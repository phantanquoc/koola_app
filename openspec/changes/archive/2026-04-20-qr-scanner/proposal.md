## Why

The KoolaHeader already has a QR icon button (`qr-code-scanner`) but pressing it does nothing. Users need a way to quickly add contacts and start conversations by scanning each other's QR codes — a pattern familiar from WeChat, Zalo, and similar Asian chat apps. This eliminates the need to manually search for phone numbers or emails.

## What Changes

- Add a fullscreen modal with two Material Top Tabs: "Quét QR" (scan) and "Mã QR của tôi" (my code)
- "Quét QR" tab: camera-based QR scanner that reads a userId, validates it, then presents an action dialog (View Profile / Send Message / Cancel)
- "Mã QR của tôi" tab: displays the current user's QR code (encoding their userId) along with their avatar and display name
- Wire the existing `onQrPress` callback in KoolaHeader to open this modal
- Install two new dependencies: `@pushpendersingh/react-native-scanner` (scanner, Fabric-ready) and `react-native-qrcode-svg` + `react-native-svg` (QR generation)

## Capabilities

### New Capabilities
- `qr-code`: QR code scanning and generation for user discovery — covers camera scanner, QR image generation, userId validation, permission handling, and post-scan actions

### Modified Capabilities

_None — no existing spec-level requirements change._

## Impact

- **New dependencies**: `@pushpendersingh/react-native-scanner`, `react-native-qrcode-svg`, `react-native-svg`
- **Android permissions**: `CAMERA` permission must be requested at runtime
- **New files**: `ChatApp/src/screens/main/QrScannerModal.tsx`
- **Modified files**: `ChatApp/src/screens/main/ChatHomeScreen.tsx` (wire onQrPress), `ChatApp/package.json` (add deps)
- **Navigation**: No new routes needed — modal is rendered inline, post-scan navigates to existing `Profile` or `Chat` screens via ChatTabStack
- **Backend**: No backend changes required — uses existing `GET /api/users/search` and `POST /api/conversations/direct/:userId`
