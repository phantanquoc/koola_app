## Context

The Connect tab (`ConnectHomeScreen`) is the business discovery surface of the app. It currently has a working data layer (`useBusinessList`, `businessesApi`) and a basic UI: a single FlatList prefixed with a horizontal `ScrollView` of `FilterChip` components for relationship filtering.

Six concrete gaps block production readiness:
1. Search bar press is a no-op (`onSearchPress={() => {}}`)
2. Filter chips are a plain scroll row instead of swipeable tabs — poor UX for a primary navigation element
3. All Vietnamese strings are missing diacritics (transliterated ASCII), making the app look unpolished to Vietnamese users
4. `BusinessCard` shows only one action at a time (profile OR connect), losing the connect CTA once connected
5. Connecting to a business never opens a conversation — users cannot follow up after connecting
6. There is no way to self-register a new business from the app

Backend: `createBusiness()` currently sets no default for `isActive`, meaning new listings created by users immediately appear in the public feed — this must be gated behind admin review.

Navigation architecture: The app uses bottom tabs (`MainTabParamList`). Each tab has its own `NativeStackNavigator`. Cross-tab navigation (Connect → Chat) requires navigating to the `ChatTab` route and then pushing `Chat` within it, using the root navigation or `navigation.getParent()`.

The direct-conversation API already exists as `conversationsApi.startDirectChat(userId)` → `POST /conversations/direct/:userId`, returning `{ conversation, isNew }`.

## Goals / Non-Goals

**Goals:**
- Wire `BusinessSearchScreen` into ConnectTabStack so search bar press navigates there
- Replace FilterChip scroll row with `createMaterialTopTabNavigator` (3 tabs: Tất cả / Đối tác / Nhà cung cấp) with swipe gesture support
- Correct all broken Vietnamese strings across the Connect feature area
- Always render both "Xem hồ sơ" and "Kết nối ngay"/"Nhắn tin" buttons on `BusinessCard`
- Connect flow: POST connect + create/reuse direct conversation + navigate cross-tab to ChatScreen
- Add `CreateBusinessScreen` behind the "+" header button; submitted businesses default to `isActive: false`

**Non-Goals:**
- Admin approval dashboard or any admin-facing UI
- Logo/media upload in the create form
- i18n library or locale switching
- Automated tests
- Business editing or deletion

## Decisions

### D1: Tab navigator placement — ConnectHomeScreen owns the TopTabNavigator

**Decision:** The `createMaterialTopTabNavigator` (ConnectTopTab) is rendered inside `ConnectHomeScreen`, above the KoolaHeader's content area. Each tab screen (`AllBusinessesTab`, `PartnersTab`, `SuppliersTab`) is a local component file or an inline functional component within the same file if small.

**Alternative considered:** Lift the tab navigator up to `ConnectTabStack` (making ConnectHome just the tab navigator). Rejected — this would break the KoolaHeader which needs to sit above the tabs and share the same NavigationProp context.

**Constraint:** Because each tab renders its own FlatList with `useBusinessList`, each tab must manage its own state independently. The `lazy: true` option on `TopTab.Navigator` prevents unnecessary fetches on inactive tabs at mount time.

### D2: Custom tab bar uses text labels, not icons

**Decision:** The Connect sub-tabs use a text-label custom tab bar (not the icon-based bar from ChatHomeScreen). Three short labels fit well without icons; icons would add visual noise.

**Rationale:** ChatHomeScreen has 5 tabs; icon shorthand is needed. Connect has 3 tabs; labels are clear and match the existing FilterChip labels.

### D3: Category sub-filter stays as a horizontal ScrollView inside the Nhà cung cấp tab

**Decision:** The category chips remain a `ScrollView` of `FilterChip` components rendered as a ListHeaderComponent within the Suppliers FlatList — not a fourth nested tab level.

**Alternative considered:** Add category as a 2nd-level tab navigator. Rejected — the category list has 12+ items which does not suit a tab bar; a scrollable chip row is the established pattern in this codebase.

### D4: Cross-tab navigation via `navigation.getParent().getParent()`

**Decision:** To navigate from ConnectTabStack to ChatTabStack's ChatScreen, use:
```
navigation.getParent()?.navigate('ChatTab')
// then from ChatTabStack, navigate to 'Chat'
```
In practice, from a screen inside ConnectTabStack (which is inside the bottom tab navigator), the pattern is:
```ts
navigation.getParent<BottomTabNavigationProp<MainTabParamList>>()?.navigate('ChatTab');
// After tab switch, use RootNavigation ref or pass conversationId as a param
```
The cleanest implementation for this codebase is to navigate to `ChatTab` at the bottom-tab level and pass a `screen` + `params` object, which React Navigation resolves via nested navigation syntax:
```ts
navigation.navigate('ChatTab' as any, { screen: 'Chat', params: { conversationId } });
```
This is the idiomatic React Navigation v6 approach for cross-tab navigation and avoids any global navigation ref additions.

### D5: `isActive: false` default set at service level, not schema level

**Decision:** Add `isActive: false` explicitly in `createBusiness()` in `businesses.service.ts` rather than relying on a Mongoose schema default.

**Rationale:** The schema field may already have a default or may not — adding it at the service level is explicit and cannot be overridden by the DTO spread. The existing listing query already filters `{ isActive: true }`, so no other code changes are needed.

### D6: `businessesApi.create()` added to apiService; no new axios client

**Decision:** Add a `create(dto)` method to the existing `businessesApi` object in `apiService.ts`. POST to `/businesses`.

### D7: `BusinessSearchScreen` uses local state + debounced `useEffect`, not a custom hook

**Decision:** Keep the search screen self-contained with `useState` + `useEffect` with a 400ms debounce via `setTimeout`/`clearTimeout`. No new hook file needed.

**Rationale:** The pattern is simple enough that a dedicated hook adds indirection without benefit. Matches the pattern seen in `UniversalSearchScreen`.

## Risks / Trade-offs

- **Cross-tab navigation typing** → TypeScript will complain about `navigate('ChatTab', { screen: 'Chat', params: ... })` because `MainTabParamList` types `ChatTab: undefined`. Use `as any` cast at the navigate call site and document the reason. Risk: low — runtime behavior is correct.
- **TopTabNavigator in ConnectHomeScreen creates nested navigation contexts** → each tab's `useNavigation()` hook will return the TopTab navigator's navigation prop, not the ConnectStack navigation prop. Tabs that need to navigate to `BusinessProfile` must receive a navigation prop from the parent or use `useNavigation` with the correct type cast. **Mitigation:** Pass `navigation` as a prop from `ConnectHomeScreen` to each tab component, or use `CompositeNavigationProp` typing. Design chooses prop-passing as the simpler approach.
- **`isActive: false` default may break existing seeded/test data** → any businesses created by existing service tests or seeds without an explicit `isActive: true` will now be invisible. **Mitigation:** Out of scope for this feature; document in the task.
- **`useBusinessList` is called independently in each tab** → on first render, 3 separate API calls fire (lazy mitigates this — only the visible tab calls on mount). Acceptable trade-off vs. shared state complexity.

## Migration Plan

1. Apply backend change (`isActive: false` default) first — it is backward-safe since the listing query already filters active businesses.
2. Apply text fixes — purely cosmetic, no behavioral change.
3. Add navigation routes and new screens — additive, no existing routes removed.
4. Refactor ConnectHomeScreen to TopTabNavigator — replaces the FilterChip scroll row; existing BusinessCard and useBusinessList are reused.
5. Update BusinessCard dual-button layout + connect-to-chat logic — updates existing component interface; ConnectHomeScreen must update its `onConnectPress` prop call site to `onConnectAndChatPress`.
6. Smoke test: all 3 tabs load data, search navigates and returns results, create form submits and shows success message, connect button opens chat.

## Open Questions

- None. All decisions resolved above based on existing codebase patterns.
