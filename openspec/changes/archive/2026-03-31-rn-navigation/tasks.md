# rn-navigation — Tasks

## Navigation Types

- [x] 1.1 Create `src/navigation/types.ts` with all param list interfaces

## Placeholder Screens

- [x] 2.1 `ConversationListScreen.tsx`
- [x] 2.2 `ChatScreen.tsx`
- [x] 2.3 `ContactsScreen.tsx`
- [x] 2.4 `ProfileScreen.tsx`
- [x] 2.5 `SettingsScreen.tsx`
- [x] 2.6 `CallScreen.tsx`

## Navigators

- [x] 3.1 `CallNavigator.tsx` — modal stack
- [x] 3.2 `ChatsStack.tsx`
- [x] 3.3 `ContactsStack.tsx`
- [x] 3.4 `SettingsStack.tsx`
- [x] 3.5 `MainNavigator.tsx` — bottom tabs with MaterialIcons
- [x] 3.6 `RootNavigator.tsx` — conditional auth routing + CallModal
- [x] 3.7 Update `AuthNavigator.tsx` — use typed `AuthStackParamList`

## App.tsx

- [x] 4.1 Replace boilerplate with `SafeAreaProvider` + `AuthProvider` + `RootNavigator`

## Auth Context Socket Integration

- [x] 5.1 `login()` → `socketService.connect()`
- [x] 5.2 `logout()` → `socketService.disconnect()`
- [x] 5.3 `useEffect` on `AppState` → reconnect socket on foreground

## Splash Screen Component

- [x] 6.1 Create `src/components/SplashScreen.tsx`

## Verification

- [x] 7.1 All navigators compile without TypeScript errors
- [x] 7.2 `npx tsc --noEmit` passes ✅
- [x] 7.3 All placeholder screens render basic UI
- [x] 7.4 Auth flow correctly shows/hides navigators
