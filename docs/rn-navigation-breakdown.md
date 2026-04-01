# rn-navigation — Breakdown

## Fog Points & Resolutions

### Fog 1: Root navigator type — React Navigation v7 structure
**Spec silent**: No RN navigation spec exists yet. `App.tsx` is still boilerplate.
- **Resolution (A)**: `NavigationContainer` at root, `AuthNavigator` + `MainNavigator` inside conditional based on `isAuthenticated`. ✅ Recommended.
- **Resolution (B)**: Two separate `NavigationContainer`s swapped.
- **Resolution (A) chosen** — standard React Navigation pattern, clean, no double container.

### Fog 2: Main navigator type — Stack vs Tab
**Spec**: App has conversation list, chat screen, contacts, call screens.
- **Resolution (A)**: Bottom tabs for main sections (Chats, Contacts, Settings), stack navigator per tab. ✅ Recommended.
- **Resolution (B)**: Single native stack with custom tab bar at bottom.
- **Resolution (A) chosen** — `@react-navigation/bottom-tabs` already in package.json.

### Fog 3: Tab screens vs deep stack screens
**Spec**: Chat detail should be a full-screen push from conversation list.
- **Resolution**: `BottomTab.Navigator` wraps `MainStack.Navigator`. Chat screen pushed onto `MainStack` inside the Chats tab. Call screen uses its own modal stack.

### Fog 4: Auth guard — how to protect main screens
**Spec silent**: No auth guard in navigation.
- **Resolution**: `useAuth().isAuthenticated` → conditional render in `App.tsx`. If not authenticated → render `AuthNavigator`. If loading → render splash. If authenticated → render `MainNavigator`.
- Also: `useFocusEffect` to reconnect socket on foreground.

### Fog 5: Screen component names — PascalCase vs kebab
- **Resolution**: PascalCase, consistent with React Native conventions. Screens: `ConversationListScreen`, `ChatScreen`, `ContactsScreen`, `SettingsScreen`, `CallScreen`, `ProfileScreen`.

### Fog 6: Screen placeholders vs full implementations
**Spec**: rn-conversations (module #14) and rn-chat (#15) define actual screens.
- **Resolution**: rn-navigation sets up the skeleton screens (placeholder content) and full navigation graph. rn-conversations and rn-chat will implement actual screen logic. This module is about routing structure only.

## Architecture Decisions (locked)

- **Root**: `App.tsx` — `NavigationContainer` + conditional auth routing
- **AuthNavigator**: Native stack — Login, Register (already exists)
- **MainNavigator**: `BottomTab.Navigator` containing 3 tab stacks:
  - **Chats Tab** (`ChatsStack`): ConversationList → Chat
  - **Contacts Tab** (`ContactsStack`): Contacts → Profile (other user)
  - **Settings Tab** (`SettingsStack`): Settings → Profile (self) → Edit Profile
- **CallNavigator**: Modal native stack overlay — CallScreen
- **Socket lifecycle**: Connect in `useAuth`, disconnect in logout. Reconnect on app foreground via `AppState`.
- **Screen params**: Use TypeScript types via `RouteProp` and `CompositeNavigationProp`

## Navigation Tree

```
RootNavigator
  ├── AuthNavigator (when !isAuthenticated)
  │     ├── Login
  │     └── Register
  │
  └── MainNavigator (when isAuthenticated)
        ├── ChatsTab (BottomTab)
        │     └── ChatsStack
        │           ├── ConversationList
        │           └── Chat
        │
        ├── ContactsTab (BottomTab)
        │     └── ContactsStack
        │           ├── Contacts
        │           └── Profile (other user)
        │
        └── SettingsTab (BottomTab)
              └── SettingsStack
                    ├── Settings
                    └── Profile (self)

CallNavigator (modal overlay — always available when authenticated)
  └── CallScreen
```

## Files to Create

```
src/navigation/
  RootNavigator.tsx          ← NavigationContainer + conditional auth
  MainNavigator.tsx          ← BottomTab containing all tab stacks
  ChatsStack.tsx            ← Stack: ConversationList → Chat
  ContactsStack.tsx         ← Stack: Contacts → Profile
  SettingsStack.tsx         ← Stack: Settings → Profile
  CallNavigator.tsx         ← Modal stack for call screen

src/screens/main/
  ConversationListScreen.tsx   ← Placeholder, full impl in rn-conversations
  ChatScreen.tsx              ← Placeholder, full impl in rn-chat
  ContactsScreen.tsx          ← Placeholder, full impl in rn-contacts
  SettingsScreen.tsx          ← Placeholder, full impl in rn-navigation
  ProfileScreen.tsx           ← Placeholder, full impl in rn-navigation
  CallScreen.tsx              ← Placeholder, full impl in rn-call

src/navigation/types.ts       ← All navigation param types
```

## Files to Modify

```
App.tsx                        ← Replace boilerplate with RootNavigator
src/contexts/AuthContext.tsx   ← Connect/disconnect socket on auth change
```

## Edge Cases Table

| Scenario | Handling |
|----------|----------|
| `isLoading = true` on start | Show splash screen (ActivityIndicator) |
| Token expired mid-session | `apiClient` interceptor catches 401 → logout → AuthNavigator |
| App goes to background then foreground | Reconnect socket via `AppState` listener |
| Call initiated while in any tab | `CallNavigator` is root-level modal, always accessible |
| Navigate to Chat without conversationId | Guard in ChatScreen — redirect back if no ID |

## Dependencies

- `@react-navigation/native`: already in package.json ✅
- `@react-navigation/native-stack`: already in package.json ✅
- `@react-navigation/bottom-tabs`: already in package.json ✅
- `react-native-screens`: already in package.json ✅
- `react-native-safe-area-context`: already in package.json ✅
