# Implementation Tasks

## 1. Navigation — fullscreen handling

- [x] 1.1 `MainNavigator.tsx`: declare `FULLSCREEN_PERSONAL_ROUTES = new Set(['EditProfile', 'StorageSettings'])`
- [x] 1.2 `MainNavigator.tsx::shouldHideTabBar`: branch on `route.name === 'PersonalTab'` and check focused route against the personal set
- [x] 1.3 `PersonalTabStack.tsx`: drop the per-screen `headerShown: true` override on `EditProfile` (top-level `screenOptions: { headerShown: false }` already covers it)
- [x] 1.4 Add `StorageSettings` route to PersonalTabStack with `headerShown: false`

## 2. EditProfileScreen — layout

- [x] 2.1 Replace nested `SafeAreaView` with `useSafeAreaInsets()` to avoid double inset on notch devices
- [x] 2.2 Hero cover band — fixed 160px, supports `coverPhoto` media key via `getOrDownload()`; placeholder when empty
- [x] 2.3 Avatar overlap (`marginTop: -56`) on a centered card; tap-to-zoom navigates to `CoverPhotoViewer` for the cover, `MediaImage` viewer for the avatar
- [x] 2.4 Apply `useTabBarBottomInset()` as `paddingBottom` on the ScrollView so the last section clears the floating dock
- [x] 2.5 Sectioned rows ("Thông tin cơ bản", "Tài khoản", "Cá nhân") — each row tap opens its bottom-sheet editor

## 3. Bottom-sheet editors

- [x] 3.1 `DisplayNameSheet` — single text field, validation matches `update-profile.dto`
- [x] 3.2 `UsernameSheet` — debounced availability check via `usersApi.checkUsername`, surface 409/reserved messages
- [x] 3.3 `BioSheet` — multiline textarea, 160-char counter
- [x] 3.4 `DateOfBirthSheet` — `@react-native-community/datetimepicker`
- [x] 3.5 `GenderSheet` — radio list (`male` / `female` / `other` / `prefer_not`)
- [x] 3.6 `PhoneSheet` — Vietnam (+84) format input → `requestPhoneOtp` → 6-digit OTP entry → `verifyPhoneOtp`; remove flow via `removePhone`
- [x] 3.7 `EditProfileSheet` orchestrator — controls which sheet is open via a discriminated state

## 4. CoverPhotoViewerScreen

- [x] 4.1 New route on the root stack (so it can navigate from EditProfile or ProfileScreen)
- [x] 4.2 Pinch-zoom via `react-native-gesture-handler` + reanimated; reuse `ZoomableImage` from `ImageViewerScreen` if shape allows
- [x] 4.3 Fall-back to placeholder when `mediaKey` is absent/missing

## 5. Verification

- [x] 5.1 `tsc --noEmit` passes on `ChatApp/`
- [x] 5.2 Visual check on Android emulator (dock no longer overlaps last section, cover not stretched, avatar centered, no double safe-area band)
- [x] 5.3 Manual: open each sheet, edit a field, save, confirm `usersApi.updateMe` payload shape and the user object returned by the server
- [x] 5.4 Manual: phone change OTP happy path (request → enter code → verify → user.phone updated)
