## Why

Tab Tron chuyen hien thi thanh tim kiem doc lap phia tren danh sach hoi thoai, chiem dung chieu cao co dinh va tach roi khoi he thong dock noi. Khi cuon danh sach, thanh tim kiem khong co hanh vi morph, khong co hieu ung glass/blur va khong chia se ngon ngu thi giac voi dock noi da thiet lap trong du an. Nguoi dung yeu cau redesign dock tim kiem theo quyet dinh da khoa: glass blur, morph 48->36, giu 3 nut khi thu gon, list cuon sau lung dock, ton trong reduce-motion.

## What Changes

- Thay the thanh tim kiem tinh hien tai bang `ChatSearchDock` dang glass: `BlurView` (`blurAmount` 18) + lop overlay dark/light + innerEdge + hairline + shadow md.
- Them hanh vi morph theo cuon: chieu cao 48->36 dieu khien boi `SharedValue` `dockProgress` va `useAnimatedStyle` voi `interpolate` tren worklet.
- Khi thu gon van giu du 3 nut hanh dong, chi thu hep padding/gap va ty le icon/chu, khong an nut.
- Danh sach hoi thoai cuon sau lung dock nho `contentContainerStyle` `paddingTop` bang chieu cao dock mo rong + inset, khong day list bang margin ngoai.
- Nhanh reduce-motion: tat interpolate/morph, giu dock o trang thai mo rong co dinh khi `AccessibilityInfo.isReduceMotionEnabled()` tra ve true hoac `prefersReducedMotion`.
- Khong doi hanh vi sub-tab, unread badge, logic search/filter va dieu huong hien tai.

## Capabilities

### New Capabilities

- `chat-search-dock`: Glass dock tim kiem co dinh dinh tab Tron chuyen voi hieu ung blur/glass, morph theo cuon, depth qua paddingTop, va ho tro reduce-motion.

### Modified Capabilities

- Khong co modified capability ngoai `chat-search-dock`; cac capability lien quan sub-tab/unread/search giu nguyen va duoc ghi nhan la khong doi trong spec.

## Impact

- `ChatApp/src/screens/main/ChatListScreen.tsx` (hoac man hinh tuong duong chua thanh tim kiem tab Tron chuyen) - tich hop `ChatSearchDock` co dinh va truyen `dockProgress` tu handler cuon.
- Component moi `ChatApp/src/screens/main/components/chat/ChatSearchDock.tsx` (glass dock, layout 3 nut, innerEdge/hairline/shadow).
- `ChatApp/src/ui/theme.ts` - neu can bo sung token overlay/hairline/shadow cho glass (additive-only, khong doi token hien co).
- Khong thay doi backend, Socket.IO, database, admin-web, hay them dependency ngoai `expo-blur`/`@react-native-community/blur` va `react-native-reanimated` da co.
- Verification gates: `openspec list --json` hien change, `openspec validate --strict` pass, markdown khong loi.
