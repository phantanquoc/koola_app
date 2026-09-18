## 1. ChatHeaderContext (new)

- [x] 1.1 Create `ChatApp/src/navigation/ChatHeaderContext.tsx` mirroring `PersonalHeaderContext.tsx`'s shape (`{config, setConfig}` context + provider type), but with a `ChatHeaderConfig` type carrying: `title: string`, `status: string | null`, `avatarKey: string`, `onBack: () => void`, `onHeaderPress: () => void`, `onStartCall: (callType: 'audio' | 'video') => void`
- [x] 1.2 Export a `useChatNavHeader(config: Omit<ChatHeaderConfig, ...>)`-style registration hook that uses `useFocusEffect`, stabilizes callback identities via refs (same pattern as `PersonalHeaderContext.tsx:24-37`, `onBackRef.current = onBack` etc. for each callback prop), sets the context config on focus, and calls `setConfig(null)` on cleanup ← (verify: registering hook's effect dependency list contains no raw callback identities, only primitive/ref-stable values, so it cannot loop)

## 2. NotchHeader chat variant

- [x] 2.1 Add a new exported height constant for the chat band's content height, computed from `koolaSpacing` plus the avatar (38), online dot (11), status line (`minHeight: 16`), and `KoolaIconButton` (`size={40}`) — no unexplained hardcoded numbers
- [x] 2.2 Change `getNotchHeaderHeight`'s signature from `(topInset: number, nav?: boolean)` to `(topInset: number, variant?: 'wordmark' | 'nav' | 'chat')`, using the new chat constant for the `'chat'` branch and the existing constants for `'wordmark'`/`'nav'` (default remains `'wordmark'` when omitted)
- [x] 2.3 Add a `chat` prop to `NotchHeaderProps` (structured config: title, status, avatarKey, onBack, onHeaderPress, onStartCall) and add a third render branch in `NotchHeader` (alongside the existing `if (onBack)` branch) that renders: back icon, `UserAvatar` at 38px with the online dot positioned bottom-right when status is "Đang hoạt động", name (KoolaText), a status line with `minHeight: 16` reserving space, and two `KoolaIconButton`s (`call` and `videocam`, `size={40}`) wired to `onStartCall('audio')` / `onStartCall('video')` ← (verify: visual structure matches what `ChatHeader.tsx` rendered — same elements, same sizes, same online-dot condition, same status-line minHeight reservation — before the old file is deleted in task 5)
- [x] 2.4 Wrap the avatar+name+status region in a pressable that calls `onHeaderPress`, matching the tap target `ChatHeader.tsx`'s `headerCenter` `TouchableOpacity` previously provided

## 3. ChatTabStack wiring

- [x] 3.1 Wrap `ChatTabStack`'s returned tree in a `ChatHeaderContext.Provider` (mirroring `PersonalTabStack.tsx:23-31`), holding the chat header config in local state
- [x] 3.2 Pass the current config's fields into `<NotchHeader chat={...} />` when a config is registered; render the plain wordmark `<NotchHeader />` (no `chat`/`onBack` props) when no config is registered ← (verify: when navigating Chat → GroupInfo → back to ChatHome, the band shows chat chrome only while Chat is focused and reverts to the wordmark immediately after, including through the `freezeOnBlur: true` transition on the `Chat` screen — do not assume `useFocusEffect` cleanup fires before freeze suspends the subtree; if it does not, drive the release from a mechanism that survives freeze, e.g. clearing config on the navigator's state-change listener rather than solely on effect cleanup)

## 4. ChatScreen migration

- [x] 4.1 Remove the `<ChatHeader ... />` render block from `ChatScreen.tsx` and the corresponding import
- [x] 4.2 Call the new `useChatNavHeader` hook in `ChatScreen`, passing `chatTitle`, `otherUserStatus`, `otherAvatarKey`, `() => navigation.goBack()`, `handleHeaderPress`, and `handleStartCall` from the existing `useChatHeaderState`/`useCallInitiation` hooks — do not modify those hooks
- [x] 4.3 Add top padding/offset to `ChatScreen`'s content (message list, and everything currently rendered starting at `styles.container`) equal to the chat variant's `getNotchHeaderHeight(insets.top, 'chat')`, following the `scrollPadTop` pattern used in `UpgradeScreen.tsx:43`
- [x] 4.4 Confirm `OfflineBanner` and `PinBanner`, both rendered before/around where `<ChatHeader>` used to sit, land below the reserved offset rather than under the band ← (verify: with network disabled and a message pinned, both banners are fully visible with no part covered by the band)

## 5. Cleanup

- [x] 5.1 Delete `ChatApp/src/screens/chat/components/ChatHeader.tsx` (confirm no remaining importers via grep before deleting)
- [x] 5.2 Update `ChatApp/src/screens/main/UpgradeScreen.tsx:43` and `ChatApp/src/screens/main/SettingsDetailScreen.tsx:83` to call `getNotchHeaderHeight(insets.top, 'nav')` instead of `getNotchHeaderHeight(insets.top, true)`

## 6. Verification

- [x] 6.1 Run `npx tsc --noEmit` in `ChatApp` — 0 errors, across all changed and touched files including `UpgradeScreen.tsx` and `SettingsDetailScreen.tsx`
- [x] 6.2 Run `npx eslint` on every file touched in this change — 0 errors
- [x] 6.3 Run the `ChatApp` jest suite — no regressions introduced
- [ ] 6.4 Leave one task explicitly unchecked for a human: on-device pixel check on a real Android device — chat band does not obscure content, no unexpected blank gap, back/avatar/name/status/call buttons all visible and tappable, band reverts to the KOOLA wordmark on leaving Chat. Do NOT check this task off as part of this implementation.
