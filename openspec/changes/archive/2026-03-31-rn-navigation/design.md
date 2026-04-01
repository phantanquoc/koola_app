# rn-navigation — Design

## Navigation Structure

```
App
└── RootNavigator (NavigationContainer)
    ├── AuthNavigator (when !isAuthenticated)
    │     ├── Login
    │     └── Register
    │
    └── MainNavigator (when isAuthenticated)
          ├── ChatsTab
          │     └── ChatsStack
          │           ├── ConversationListScreen
          │           └── ChatScreen
          │
          ├── ContactsTab
          │     └── ContactsStack
          │           ├── ContactsScreen
          │           └── ProfileScreen (other user)
          │
          └── SettingsTab
                └── SettingsStack
                      ├── SettingsScreen
                      └── ProfileScreen (self)

CallNavigator (root-level modal, always on top)
└── CallScreen
```

## Screens & Params

| Screen | Navigator | Params |
|--------|-----------|--------|
| `Login` | AuthStack | — |
| `Register` | AuthStack | — |
| `ConversationList` | ChatsStack | — |
| `Chat` | ChatsStack | `{ conversationId: string }` |
| `Contacts` | ContactsStack | — |
| `Profile` | ContactsStack | `{ userId: string }` |
| `Settings` | SettingsStack | — |
| `MyProfile` | SettingsStack | — |
| `EditProfile` | SettingsStack | — |
| `Call` | CallStack | `{ sessionId: string, callType: 'audio'|'video', isInitiator: boolean }` |

## Auth Flow

1. App mounts → `AuthProvider` calls `restoreSession()`
2. If `isLoading = true` → show `<SplashScreen />`
3. If `isAuthenticated = false` → render `AuthNavigator`
4. If `isAuthenticated = true` → render `MainNavigator` + `CallNavigator`

## Socket Lifecycle

- `AuthContext.login()` → calls `socketService.connect()`
- `AuthContext.logout()` → calls `socketService.disconnect()`
- AppState change to `active` → `socketService.connect()` if not connected
- AppState change to `background` → no action (socket handles reconnect)

## Navigation Type Generation

Use `RouteProp` + `CompositeNavigationProp` pattern:
```typescript
type ChatScreenProps = {
  navigation: CompositeNavigationProp<
    NativeStackNavigationProp<ChatsStackParamList, 'Chat'>,
    BottomTabNavigationProp<MainTabParamList>
  >;
  route: RouteProp<ChatsStackParamList, 'Chat'>;
};
```

## File Structure

```
src/navigation/
  types.ts              ← All param list types
  RootNavigator.tsx     ← NavigationContainer + conditional
  AuthNavigator.tsx     ← Already exists, update to use types
  MainNavigator.tsx     ← BottomTab + all stacks
  ChatsStack.tsx
  ContactsStack.tsx
  SettingsStack.tsx
  CallNavigator.tsx

src/screens/main/
  ConversationListScreen.tsx
  ChatScreen.tsx
  ContactsScreen.tsx
  SettingsScreen.tsx
  ProfileScreen.tsx
  CallScreen.tsx

src/components/
  SplashScreen.tsx      ← Loading state
```

## Color & Icon Convention (for later tabs)

| Tab | Icon name (MaterialIcons) |
|-----|--------------------------|
| Chats | `chat-bubble-outline` |
| Contacts | `contacts` |
| Settings | `settings` |
