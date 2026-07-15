## 1. Audit and Impact

- [x] 1.1 Run `npm run ui:audit` and confirm the 28 gapFlexRow files match expectations
- [x] 1.2 Run GitNexus upstream impact analysis for shared layout components (`KoolaHeader`, `OfflineBanner`, etc.) before editing
- [x] 1.3 Record current visual appearance of affected row layouts as baseline

## 2. Screen Fixes

- [x] 2.1 Fix call screens: `CallScreen.tsx`, `IncomingCallScreen.tsx`
- [x] 2.2 Fix chat screen: `ChatScreen.tsx`
- [x] 2.3 Fix connect screens: `BusinessProfileScreen.tsx`, `BusinessSearchScreen.tsx`, `ConnectHomeScreen.tsx`
- [x] 2.4 Fix main screens: `AccountListScreen.tsx`, `CallsScreen.tsx`, `MomentsScreen.tsx`, `ProfileScreen.tsx`, `StorageSettingsScreen.tsx`, `UniversalSearchScreen.tsx`
- [x] 2.5 Fix main components: `EditProfileSheet.tsx`
- [x] 2.6 Fix moments screens: `AudienceListEditorScreen.tsx`, `HighlightsScreen.tsx`, `MomentComposerScreen.tsx`, `MomentViewerScreen.tsx`
- [x] 2.7 Fix commerce screens: `ServicesHomeScreen.tsx`, `ShoppingHomeScreen.tsx`

## 3. Component Fixes

- [x] 3.1 Fix connect components: `BusinessCard.tsx`, `BusinessCardSkeleton.tsx`, `ConnectContextBanner.tsx`, `ProvincePicker.tsx`, `SortMenu.tsx`
- [x] 3.2 Fix shared components: `KoolaHeader.tsx`, `OfflineBanner.tsx`
- [x] 3.3 Fix moments components: `MusicPicker.tsx`, `StoryReferenceCard.tsx`

## 4. Verification

- [x] 4.1 Run `cd ChatApp && npm run ui:audit` and confirm gapFlexRow count is 0
- [x] 4.2 Run `cd ChatApp && npm run tsc`
- [x] 4.3 Run `cd ChatApp && npm run lint`
- [x] 4.4 Run `cd ChatApp && npx jest --passWithNoTests`
- [ ] 4.5 Visual spot-check: confirm row items remain horizontal with correct spacing on affected screens
- [x] 4.6 Run `openspec validate fix-row-gap-flex-layout --type change --strict --no-interactive`
- [ ] 4.7 Run GitNexus change detection before any requested commit and confirm only style/layout flows are affected
