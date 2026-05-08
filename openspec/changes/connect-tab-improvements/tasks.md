## 1. Backend: isActive Default

- [x] 1.1 In `chat-backend/src/businesses/businesses.service.ts`, update `createBusiness()` to explicitly set `isActive: false` in the new `Business` document object (before `business.save()`)

## 2. Types and Navigation Routes

- [x] 2.1 In `ChatApp/src/navigation/types.ts`, add `BusinessSearch: undefined` and `CreateBusiness: undefined` to `ConnectTabStackParamList`
- [x] 2.2 In `ChatApp/src/services/api/apiService.ts`, add a `create(dto: CreateBusinessPayload)` method to `businessesApi` that posts to `POST /businesses` and returns the created `Business` ← (verify: method exists on `businessesApi` and TypeScript compiles without errors)

## 3. Text Fixes

- [x] 3.1 Fix `ChatApp/src/screens/connect/constants.ts`: update all labels in `RELATIONSHIP_FILTERS` and `BUSINESS_CATEGORIES` to correct Vietnamese with diacritics ("Tất cả", "Đối tác", "Nhà cung cấp", "Nội địa", "Nguyên liệu", "Bao bì", "Sản xuất", "Thực phẩm", "Công nghệ", "Tài chính", "Bán lẻ", "Y tế", "Giáo dục")
- [x] 3.2 Fix `ChatApp/src/components/connect/BusinessCard.tsx`: update `typeLabel` string literals to "Đối tác" and "Nhà cung cấp"; update button text "Kết nối ngay" (handled in step 5)
- [x] 3.3 Fix `ChatApp/src/screens/connect/BusinessProfileScreen.tsx`: update all untranslated string literals ("Giới thiệu", "Liên hệ", "Địa chỉ", "Đối tác", "Nhà cung cấp", "Đã kết nối", "Kết nối ngay", "Không tìm thấy doanh nghiệp", "người đã kết nối", "Kết nối")
- [x] 3.4 Fix `ChatApp/src/components/connect/EmptyConnect.tsx`: update empty state strings to "Chưa có doanh nghiệp nào" and "Hãy thử thay đổi bộ lọc để tìm kết quả phù hợp"
- [x] 3.5 Fix `ChatApp/src/navigation/ConnectTabStack.tsx`: update `BusinessProfile` screen title to "Hồ sơ doanh nghiệp"
- [x] 3.6 Fix `ChatApp/src/screens/connect/ConnectHomeScreen.tsx`: update `KoolaHeader` prop `searchPlaceholder` to "Tìm doanh nghiệp..." ← (verify: all changed strings render with correct diacritics on device/emulator)

## 4. Sub-Tab Navigator in ConnectHomeScreen

- [x] 4.1 Create three sub-tab screen components (can be in separate files or inline in `ConnectHomeScreen.tsx`): `AllBusinessesTab`, `PartnersTab`, `SuppliersTab` — each owns its own `useBusinessList` call with the appropriate `relationshipType` filter
- [x] 4.2 `SuppliersTab` SHALL include a horizontal `ScrollView` of `FilterChip` components (from `BUSINESS_CATEGORIES`) as a `ListHeaderComponent`, managing its own `categoryFilter` state
- [x] 4.3 Create a `ConnectCustomTabBar` component (text labels, active: blue `#1565C0` + underline indicator, inactive: grey `#6B7280`) following the same interface as `CustomTabBar` in `ChatHomeScreen.tsx`
- [x] 4.4 Replace the `ScrollView`+`FilterChip` block and `FlatList` in `ConnectHomeScreen` with `TopTab.Navigator` using `ConnectCustomTabBar`, `swipeEnabled: true`, `lazy: true`, and the three tab screens ← (verify: swipe between all 3 tabs works, each tab loads its own filtered data, lazy loading prevents unused tabs from fetching on mount)

## 5. BusinessCard Dual-Button Refactor

- [x] 5.1 Update `BusinessCardProps` interface: remove `onConnectPress`, add `onConnectAndChatPress: () => void` and `onMessagePress: () => void`
- [x] 5.2 Update the bottom action area of `BusinessCard` to always render two buttons: "Xem hồ sơ" (left, calls `onPress`) and either "Kết nối ngay" (calls `onConnectAndChatPress`, when `!isConnected`) or "Nhắn tin" (calls `onMessagePress`, when `isConnected`); apply loading/disabled state via `isConnecting` prop to the right button
- [x] 5.3 Update all call sites of `BusinessCard` in `ConnectHomeScreen` (and sub-tab components) to pass the new props; remove the old `onConnectPress` prop ← (verify: both buttons visible on card regardless of connection state, correct button label shown per isConnected value)

## 6. Connect-to-Chat Flow

- [x] 6.1 Implement `handleConnectAndChat(business: Business)` in each sub-tab (or in a shared hook/inline in the tab component): (a) optimistic update `isConnected: true`, (b) call `businessesApi.connect(id)`, on error rollback; (c) on success, call `conversationsApi.startDirectChat(business.ownerId)`, on error `console.warn` and return; (d) navigate cross-tab using `navigation.navigate('ChatTab' as any, { screen: 'Chat', params: { conversationId } })`
- [x] 6.2 Implement `handleMessage(business: Business)` in each sub-tab: call `conversationsApi.startDirectChat(business.ownerId)` then navigate to ChatScreen using the same cross-tab navigation pattern
- [x] 6.3 Pass `onConnectAndChatPress` and `onMessagePress` from each sub-tab to `BusinessCard` ← (verify: tapping "Kết nối ngay" on an unconnected business opens ChatScreen in the ChatTab; tapping "Nhắn tin" on a connected business also opens ChatScreen)

## 7. BusinessSearchScreen

- [x] 7.1 Create `ChatApp/src/screens/connect/BusinessSearchScreen.tsx`: TextInput with `autoFocus`, local state `query`, `results` (Business[]), `loading` boolean
- [x] 7.2 Add `useEffect` that fires a debounced (400ms) call to `businessesApi.list({ q: query })` when `query.length >= 2`; clear results when `query.length < 2`
- [x] 7.3 Render results in a `FlatList` using `BusinessCard` with the same `onPress`, `onConnectAndChatPress`, `onMessagePress` handlers; show `EmptyConnect` or a prompt when no results
- [x] 7.4 Register `BusinessSearch` screen in `ConnectTabStack.tsx` (NativeStack, no header or with a back button)
- [x] 7.5 Wire `onSearchPress` in `ConnectHomeScreen`'s KoolaHeader to `navigation.navigate('BusinessSearch')` ← (verify: tapping search bar opens BusinessSearchScreen, typing 2+ chars returns results, typing fewer than 2 chars clears list)

## 8. CreateBusinessScreen

- [x] 8.1 Create `ChatApp/src/screens/connect/CreateBusinessScreen.tsx` with a `ScrollView` form: required fields (name TextInput, relationshipType picker, category picker from `BUSINESS_CATEGORIES` excluding `all`, province TextInput) and optional fields (tagline, description multiline, address, website, contactEmail with `email-address` keyboard, contactPhone with `phone-pad` keyboard)
- [x] 8.2 Implement client-side validation: check required fields non-empty, `name.length >= 2`; display inline error strings in Vietnamese for each failed check
- [x] 8.3 Implement submit handler: show loading indicator, call `businessesApi.create(dto)`, on success show "Đã gửi yêu cầu đăng ký doanh nghiệp. Vui lòng chờ admin duyệt." then `navigation.goBack()`; on error display inline error message and preserve form data
- [x] 8.4 Register `CreateBusiness` screen in `ConnectTabStack.tsx` with `headerShown: true` and title "Đăng ký doanh nghiệp"
- [x] 8.5 Wire `onAddPress` in `ConnectHomeScreen`'s KoolaHeader to `navigation.navigate('CreateBusiness')` ← (verify: form submits successfully, success message appears, new business does NOT appear in the public listing immediately)
