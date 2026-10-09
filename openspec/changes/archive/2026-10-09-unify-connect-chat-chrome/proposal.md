# Unify Connect Chrome With Chat Chrome

## Why

The Kết nối (Connect) tab and the Trò chuyện (Chat) tab are supposed to read as one app, but their home chrome is visibly different: Chat's header dock carries two icon actions while Connect's is search-only, Connect shows a chip-pill filter row where Chat shows a text sub-tab bar, and Connect paints two separate glass sheets split by a hairline where Chat paints one continuous sheet. On top of that, two Connect features are already built but unreachable — the QR scanner modal and the advanced filter sheet are rendered, yet no code path ever sets them to visible, so they can never open.

## What Changes

- **Connect dock gains two actions.** Connect's header dock becomes `[Tìm kiếm] [QR] [Lọc]`, matching Chat's `[Tìm kiếm] [QR] [＋]` geometry, icon size, icon color, and touch-target width. This makes the existing QR scanner modal reachable for the first time.
- **Connect filter row becomes a text sub-tab bar.** The 44dp horizontal chip-pill scroller (`Tất cả` / `Đối tác` / `Nhà cung cấp` as filled pills) is replaced by a 40dp text bar with three evenly divided labels — `Tất cả` / `Yêu cầu mua` / `Yêu cầu bán` — using Chat's active treatment (primary-colored label plus the same 20×2 gradient underline) and Chat's scroll-hide behaviour. This makes the existing advanced filter sheet reachable via the new `Lọc` dock action.
- **Relationship labels become one shared source.** The `partner` / `supplier` display names change from `Đối tác` / `Nhà cung cấp` to `Yêu cầu mua` / `Yêu cầu bán`, and every surface that renders this field reads from a single shared label map so the same field never carries two different names. Underlying slugs and the backend enum are unchanged.
- **Connect and Chat share one glass sheet.** The glass rendering that Chat currently owns privately (tint + bloom + hairline + elevation shadow, with its height animating as the sub-tab bar hides) is extracted into a shared `ChromeGlassSheet` component. Chat and Connect both render it, so the two tabs cannot drift apart again. Connect switches its header box to the glass-less mode that Chat already uses.
- **Connect mock data becomes filterable.** None of the five mock businesses carry a relationship type, so selecting a relationship filter silently leaves every mock in the list. Mocks gain relationship values, and the mock-filtering predicate is extracted into a pure, testable function that drops relationship-less items when a relationship filter is active.
- **Shared dock action component.** The repeated six-line pressable block for dock icon actions is extracted into a `HeaderDockAction` component reused by both tabs, including an optional count badge (used by Connect's filter action).

## Capabilities

### New Capabilities
- `connect-home-navigation-chrome`: the Connect home chrome contract — dock actions, text sub-tab bar geometry and states, single glass sheet, list inset reserve, and scroll-hide behaviour.

### Modified Capabilities
- `shared-frosted-header-box`: Connect is no longer a search-only dock consumer; the "Connect SHALL pass no rightActions" clause and its search-only scenario are replaced by the real Connect dock composition. The shared glass sheet contract is registered here alongside the existing header box contract.
- `connect-discovery`: the "Discovery Filters Preserved" requirement keeps its behaviour but its relationship sub-tab labels change from `Đối tác` / `Nhà cung cấp` to `Yêu cầu mua` / `Yêu cầu bán`; the "Connect Home Header Uses Shared Frosted Box With Search-Only Dock" requirement is superseded by the new `connect-home-navigation-chrome` capability and is removed here.

## Impact

- **Mobile UI (Connect)**: `ChatApp/src/screens/connect/ConnectHomeScreen.tsx` (dock actions, sub-tab bar, list inset, mock filter, error-branch chrome), `ChatApp/src/screens/connect/constants.ts` (filter labels + shared relationship label map).
- **Mobile UI (Chat)**: `ChatApp/src/screens/main/ChatHomeScreen.tsx` — glass constants and local shadow/scrim definitions are removed in favour of the shared component. This file is performance-sensitive; the change is a pure extraction with no behavioural delta on Chat.
- **Mobile components**: new `ChatApp/src/components/ChromeGlassSheet.tsx`; `ChatApp/src/components/HeaderSearchDock.tsx` gains `HeaderDockAction`. Consumers of the header box: `ConnectHomeScreen`, `ChatHomeScreen`. `SettingsScreen` keeps using the deprecated dock props and is not touched.
- **Mobile data / display**: `ChatApp/src/screens/connect/mockBusinesses.ts`, `ChatApp/src/components/connect/EmptyConnect.tsx`, `ChatApp/src/screens/connect/BusinessProfileScreen.tsx`, `ChatApp/src/screens/main/AccountListScreen.tsx` (all read the shared label map).
- **Tests**: new pure-logic specs for the filter labels and the extracted mock predicate.
- **Not changed**: backend (`BusinessRelationshipType` remains `'partner' | 'supplier'`), API parameters, navigation routes, `ConversationListScreen.tsx`, `SettingsScreen.tsx`.
- **Pre-existing failures out of scope**: 6 `tsc` errors and 6 failing Jest suites already exist on `master` before this change; they are reported, not fixed.