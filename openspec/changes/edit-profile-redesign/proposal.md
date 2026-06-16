# EditProfileScreen — Layout Redesign

> **STATUS: SHIPPED** — implementation merged into `feat/moments-completion-phase2` (PR #1) as part of `feat(profile)` and `feat(chat+shell)` commits. Ready to archive when PR #1 lands on master.

## Why

Five layout bugs prevented EditProfileScreen from rendering correctly on every device:

1. **Tab bar overlay** — floating dock occluded ~86px bottom because `shouldHideTabBar()` only checked `ChatTab`, never PersonalTab children.
2. **Cover band stretching** — combination of `headerShown: true`, EditProfileScreen's own `SafeAreaView`, and the floating dock fought for vertical space, collapsing layout on shorter devices.
3. **Avatar displacement** — `-56` marginTop was mathematically correct but became visually wrong once cover/header/dock ate the viewport.
4. **Bottom content hidden** — `paddingBottom: 32` left "TÀI KHOẢN" / "CÁ NHÂN" sections behind the dock; should have been ≥102px.
5. **Double SafeArea** — native header inset + screen-level SafeAreaView added redundant top inset on notch devices.

Full root cause analysis: see `design.md`.

## What Changes

- **MainNavigator.tsx**: introduce `FULLSCREEN_PERSONAL_ROUTES` set; `shouldHideTabBar()` honours both `ChatTab` (Chat/MomentViewer/MomentComposer) and `PersonalTab` (EditProfile/StorageSettings).
- **PersonalTabStack.tsx**: drop `headerShown: true` override per-screen — screens own their own headers; this also kills the double-SafeArea by collapsing the native header band.
- **EditProfileScreen.tsx**: full rewrite to a sheet-based editor — hero cover band, overlapping avatar (96px), display-name/username inline, sectioned rows ("Thông tin cơ bản", "Tài khoản", "Cá nhân") that open `BottomSheet` editors per field; uses `useSafeAreaInsets()` and `useTabBarBottomInset()` for correct paddings.
- **screens/main/components/edit-profile/**: new `BioSheet`, `DisplayNameSheet`, `UsernameSheet`, `DateOfBirthSheet`, `GenderSheet`, `PhoneSheet`, `EditProfileSheet` (orchestrator).
- **CoverPhotoViewerScreen.tsx**: full-screen pinch-zoom viewer when the cover thumbnail is tapped.

## Layout Decision

Adopted a **hybrid of design.md Option A (compact list) + Option C (cover hero with sheet editor)** — keeps the cover band for visual personality but moves all field edits into bottom-sheet editors so the visible page is a fast, scannable list rather than a long form.

## Capabilities

This change extends `user-profile` capability (already shipped under `2026-06-11-user-profile-expansion`). No new spec capability is introduced — the redesign is purely UI/layout. The `user-profile` spec § "EditProfile UI Layout" requirements cover the sheet-based pattern adopted here.
