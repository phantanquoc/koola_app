# rn-navigation — Proposal

## Summary
Set up the complete React Navigation structure for the chat app: root navigator with auth routing, bottom tabs (Chats/Contacts/Settings), stacks per tab, and a modal CallNavigator overlay.

## Motivation
React Native's navigation architecture is the backbone of the entire app. This module establishes the routing skeleton so that all future modules (rn-conversations, rn-chat, rn-contacts, rn-call) can build on top of it without restructuring.

## Scope

### In scope
- `App.tsx` — replace boilerplate with `RootNavigator`
- `RootNavigator` — `NavigationContainer` + conditional auth routing
- `MainNavigator` — bottom tabs (Chats, Contacts, Settings)
- Tab stacks: `ChatsStack`, `ContactsStack`, `SettingsStack`
- `CallNavigator` — modal call screen overlay
- All navigation param types
- Placeholder screens for all routes (full implementation deferred)

### Out of scope
- Full screen implementations (handled by later modules)
- Custom tab bar UI
- Deep linking

## Deliverables
- `src/navigation/` — all navigators
- `src/screens/main/` — placeholder screens
- Updated `App.tsx`
- OpenSpec artifacts: `proposal.md`, `design.md`, `tasks.md`
