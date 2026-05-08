## Why

The Connect tab (Kết nối) is the app's business discovery surface, but it is currently incomplete: broken search, missing proper sub-tab navigation, incorrect Vietnamese text throughout, limited interaction patterns on business cards, no way to start a conversation after connecting, and no self-serve flow for businesses to register themselves. These gaps make the feature unsuitable for real users.

## What Changes

- **New screen:** `BusinessSearchScreen` — debounced full-text search using the existing `GET /api/businesses?q=` endpoint, added to ConnectTabStack
- **New screen:** `CreateBusinessScreen` — form to register a new business (`POST /api/businesses`), navigated to via the "+" header button
- **Navigation refactor:** Replace the horizontal FilterChip ScrollView in `ConnectHomeScreen` with a `createMaterialTopTabNavigator` (3 swipeable sub-tabs: Tất cả / Đối tác / Nhà cung cấp), following the ChatHomeScreen pattern
- **BusinessCard interaction upgrade:** Always show both "Xem hồ sơ" and "Kết nối ngay" / "Nhắn tin" buttons; the connect button creates a direct conversation and navigates to ChatScreen
- **Backend change:** `BusinessesService.createBusiness()` sets `isActive: false` by default so new listings require admin approval before appearing in the public feed
- **Text fix:** All Vietnamese strings across `constants.ts`, `BusinessCard.tsx`, `BusinessProfileScreen.tsx`, `EmptyConnect.tsx`, `ConnectTabStack.tsx`, and `KoolaHeader.tsx` are corrected to include proper diacritics

## Capabilities

### New Capabilities

- `business-search`: Full-text search screen for businesses within the Connect tab; uses existing backend `?q=` param, debounced input, renders result list with same BusinessCard component
- `business-registration`: Self-serve business creation form covering all required and optional fields from `CreateBusinessDto`; new businesses land in `isActive: false` state pending admin review
- `connect-tab-navigation`: Swipeable MaterialTopTabNavigator replacing the FilterChip row (3 sub-tabs); each tab owns its own FlatList + `useBusinessList` call filtered by relationship type
- `connect-to-chat-flow`: After connecting to a business, create or reuse a direct conversation with the business owner and navigate cross-tab to ChatScreen

### Modified Capabilities

- `conversation-management`: The direct-conversation creation endpoint (`POST /api/conversations/direct`) is consumed from a new context (Connect tab) — no requirement change, dependency documented here for traceability

## Impact

**Frontend files modified:**
- `ChatApp/src/screens/connect/ConnectHomeScreen.tsx` — replaces FilterChip ScrollView with TopTabNavigator
- `ChatApp/src/navigation/ConnectTabStack.tsx` — adds BusinessSearch and CreateBusiness routes
- `ChatApp/src/navigation/types.ts` — adds new route param types
- `ChatApp/src/components/connect/BusinessCard.tsx` — dual-button layout + connect-to-chat logic
- `ChatApp/src/components/connect/FilterChip.tsx` — still used within supplier sub-tab for category sub-filter
- `ChatApp/src/components/connect/EmptyConnect.tsx` — text fixes only
- `ChatApp/src/screens/connect/BusinessProfileScreen.tsx` — text fixes only
- `ChatApp/src/screens/connect/constants.ts` — text fixes only
- `ChatApp/src/components/KoolaHeader.tsx` — search press navigation fix

**Frontend files created:**
- `ChatApp/src/screens/connect/BusinessSearchScreen.tsx`
- `ChatApp/src/screens/connect/CreateBusinessScreen.tsx`

**Backend files modified:**
- `chat-backend/src/businesses/businesses.service.ts` — set `isActive: false` as default in `createBusiness()`

**Dependencies:** No new npm packages required; `@react-navigation/material-top-tabs` already present (used by ChatHomeScreen).
