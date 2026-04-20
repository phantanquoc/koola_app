## Context

The KoolaHeader component has a QR icon button (`MaterialIcons: qr-code-scanner`) with an `onQrPress` callback that is currently not wired. The app uses React Native 0.76 with New Architecture (Fabric) enabled, React Navigation 7 with Material Top Tabs, and a ChatTabStack (NativeStackNavigator) for chat-related screens.

Existing infrastructure:
- `ProfileScreen` at `ChatTabStack > Profile` accepts `{ userId }` param
- `conversationsApi.startDirectChat(userId)` creates/finds direct conversation
- `useAuth()` provides current user info (`_id`, `displayName`, `avatar`)
- `usersApi.searchUsers(query)` can validate if a userId exists

## Goals / Non-Goals

**Goals:**
- Let users scan another user's QR code to view their profile or start a chat
- Let users display their own QR code for others to scan
- Handle all error states: invalid QR, self-scan, user not found, camera permission denied

**Non-Goals:**
- Deep link / URL-based QR (just plain userId string)
- Share QR code as image file
- QR code customization (colors, logo)
- Backend changes

## Decisions

### 1. QR Scanner Library: `@pushpendersingh/react-native-scanner`
**Rationale**: Built for Fabric/New Architecture in Kotlin and Objective-C. Lightweight, focused on QR/barcode scanning. Alternative `react-native-vision-camera` is more powerful but heavier and requires a separate code-scanner plugin.

### 2. QR Generator Library: `react-native-qrcode-svg` + `react-native-svg`
**Rationale**: Pure JS rendering via SVG — no native module needed. Mature, well-maintained. Alternative `react-native-qrcode-skia` requires Skia dependency which the project doesn't use.

### 3. Modal with Material Top Tabs (not a new navigation screen)
**Rationale**: Using a React Native `Modal` rendered inside `ChatHomeScreen` avoids adding a new route to `ChatTabStack`. The two tabs ("Quét QR" / "Mã QR của tôi") use `@react-navigation/material-top-tabs` for consistency with `ChatHomeScreen`'s existing sub-tabs. Swiping between tabs feels native.

### 4. QR Content: Plain userId string
**Rationale**: Simplest format. A 24-character MongoDB ObjectId string is compact and easy to validate (`/^[0-9a-fA-F]{24}$/`). No need for JSON, deep links, or URL schemes at this stage.

### 5. Post-scan action: Alert dialog with 3 options
**Rationale**: Using `Alert.alert` with "Xem hồ sơ" / "Nhắn tin" / "Hủy" is consistent with existing patterns in the app (e.g., `handleAttachment` in ChatScreen). No custom bottom sheet needed.

### 6. userId validation: regex + API check
**Rationale**: First validate format with ObjectId regex (instant, no network). Then call `usersApi.searchUsers(userId)` to verify the user exists. This catches both invalid QR content and deleted/nonexistent users.

## Risks / Trade-offs

- **[Camera permission on first use]** → User must grant camera permission. If denied, show alert with "Open Settings" button using `Linking.openSettings()`.
- **[Scanner lib maturity]** → `@pushpendersingh/react-native-scanner` is newer than vision-camera. If issues arise, can swap to vision-camera later without changing the modal architecture.
- **[Material Top Tabs inside Modal]** → Requires wrapping in `NavigationContainer` (independent from app's root navigator) since Modal content is outside the navigation tree. This is a known pattern.
