## Why

The Chat conversation screen (`ChatScreen`) renders its own header (back button, avatar, name, online status, call buttons) starting at the very top of its container. But `ChatTabStack` also renders a shared `NotchHeader` band as an absolutely-positioned, `zIndex: 10` sibling that paints over every screen in the stack. Every other screen in the stack accounts for this band's height before laying out its own content (`ChatHomeScreen`, `SettingsDetailScreen`, `UpgradeScreen`, `SettingsScreen`, `ShoppingHomeScreen`) — `ChatScreen` does not. The result: the shared band's frosted background and KOOLA wordmark paint directly on top of `ChatScreen`'s back button and avatar, and also over the `OfflineBanner` rendered just above the header. Users cannot reliably see or tap the top of the chat header.

## What Changes

- `ChatScreen` stops rendering its own header component and instead "takes over" the shared `NotchHeader` band while focused — the same takeover pattern `PersonalTabStack`/`UpgradeScreen` already use for the Nâng cấp screen, extended to carry chat-specific content (avatar, name, status, call actions) instead of just back+title.
- **NEW** `ChatHeaderContext` (mirrors `PersonalHeaderContext`) lets `ChatScreen` register/release a structured header config (title, status, avatar key, callbacks) on focus/blur.
- `NotchHeader` gains a third render variant ("chat") that displays back button + avatar (with online dot) + name + status line + audio call + video call, sized from existing spacing tokens.
- `getNotchHeaderHeight`'s boolean `nav?` parameter becomes an explicit variant union (`'wordmark' | 'nav' | 'chat'`) so callers state which band shape they need instead of a binary flag. **BREAKING** for the two existing call sites (`UpgradeScreen`, `SettingsDetailScreen`), which are updated in the same change.
- `ChatScreen` reserves top padding/offset for the shared band instead of drawing behind it, so the message list, `OfflineBanner`, and `PinBanner` all start below the band.
- **REMOVED** `ChatApp/src/screens/chat/components/ChatHeader.tsx` — superseded by the NotchHeader chat variant, with no remaining importers.

## Capabilities

### New Capabilities
- `chat-conversation-header-chrome`: Governs how the Chat conversation screen's header (identity, presence, call actions) is presented via the shared notch band, and that it is never obscured by or obscures other chrome.

### Modified Capabilities
(none — no existing spec file described `ChatHeader.tsx`'s behavior; this is new spec coverage, not a change to a previously specified requirement)

## Impact

- **Affected code**: `ChatApp/src/navigation/ChatHeaderContext.tsx` (new), `ChatApp/src/navigation/ChatTabStack.tsx`, `ChatApp/src/components/NotchHeader.tsx`, `ChatApp/src/screens/chat/ChatScreen.tsx`, `ChatApp/src/screens/chat/components/ChatHeader.tsx` (removed), `ChatApp/src/screens/main/UpgradeScreen.tsx`, `ChatApp/src/screens/main/SettingsDetailScreen.tsx`.
- **No backend impact** — presentation-only change on the mobile client.
- **Out of scope**: `GroupInfoScreen` has a visually similar header-obscuring defect (`paddingTop: insets.top` without accounting for the notch band) but is explicitly not touched by this change.
