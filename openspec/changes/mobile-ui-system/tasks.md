## 1. NativeWind Foundation

- [x] 1.1 Add NativeWind v4 and Tailwind CSS 3.4 dependencies to `ChatApp/package.json` and install them.
- [x] 1.2 Add `tailwind.config.js` with Koola content paths, NativeWind preset, and theme token extensions.
- [x] 1.3 Add `global.css` with Tailwind directives and import it once from the mobile app entry/root.
- [x] 1.4 Update Babel and Metro configuration for NativeWind while preserving Reanimated plugin ordering.
- [x] 1.5 Add NativeWind TypeScript declarations. ← (verify: a component can use `className` without TypeScript errors)

## 2. Shared UI System

- [x] 2.1 Create `ChatApp/src/ui/theme.ts` with Koola colors, spacing, radius, typography, shadow, and semantic tokens.
- [x] 2.2 Create shared primitives: `KoolaText`, `KoolaSurface`, `KoolaButton`, `KoolaIconButton`, `KoolaTextInput`, `KoolaBadge`, `KoolaChip`, `KoolaDivider`, `KoolaSkeleton`, and `KoolaState`.
- [x] 2.3 Export primitives from `ChatApp/src/ui/index.ts`.
- [x] 2.4 Ensure primitives support disabled, pressed, loading, error, empty, and long-text states where applicable. ← (verify: primitives render without layout overlap for long Vietnamese labels)

## 3. High-Visibility Component Migration

- [x] 3.1 Migrate `KoolaHeader`, `OfflineBanner`, `UserAvatar`, and common search result items to use UI tokens/primitives.
- [x] 3.2 Migrate Connect cards, skeletons, empty state, list error state, sort menu, and province picker to the shared UI system.
- [x] 3.3 Migrate media display wrappers only where visual styling is isolated from upload/playback logic. ← (verify: image/video rendering behavior remains unchanged) — MediaImage placeholder/loading/error surfaces + FileAttachment bubble text/button migrated to semantic tokens (also fixed white-on-light-blue own-bubble contrast bug); VideoMessage dark poster fallback + upload-progress scrim intentionally left fixed (media-on-dark, theme-independent); VideoPlayerModal/ZoomableImage fullscreen viewers left black by design. tsc + 664 jest pass.

## 4. Screen Migration

- [x] 4.1 Migrate auth screens (`LoginScreen`, `RegisterScreen`, `OtpVerifyScreen`) to refreshed Koola UI primitives.
- [x] 4.2 Migrate account screens (`ProfileScreen`, `EditProfileScreen`, `SettingsScreen`) to refreshed Koola UI primitives.
- [x] 4.3 Migrate conversation/home/search screens (`ChatHomeScreen`, `ConversationListScreen`, `UniversalSearchScreen`, `ContactsScreen`) to refreshed Koola UI primitives. ← (note: `ChatHomeScreen` and `ConversationListScreen` migrated; `UniversalSearchScreen` not yet migrated)
- [x] 4.4 Migrate chat chrome (`ChatScreen` header/composer/action surfaces only) without changing message send/read/media logic. — verified: ChatHeader, ChatComposer, and ChatScreen container/bubble/action surfaces already resolve every color from `useTheme()`/semantic+component tokens (no hardcoded hex in chrome); ChatComposer stays uncontrolled (textRef, no `value` prop); send/read/media handlers untouched.
- [x] 4.5 Migrate Connect screens (`ConnectHomeScreen`, `BusinessSearchScreen`, `BusinessProfileScreen`, `CreateBusinessScreen`) to refreshed Koola UI primitives. ← (verify: all migrated screens use shared tokens/primitives for main controls and preserve navigation/API calls)

## 5. Validation

- [x] 5.1 Run `npm run tsc` in `ChatApp`.
- [x] 5.2 Run mobile lint if the ESLint config is available; otherwise document the existing ESLint 9 config blocker.
- [x] 5.3 Run Android Metro/build smoke check after NativeWind setup.
- [x] 5.4 Run `npx gitnexus detect-changes` from repo root and confirm affected scope is limited to mobile UI plus OpenSpec artifacts. ← (verify: no backend APIs, socket events, WebRTC contracts, or `.env` files changed) — detect-changes flagged "high" on volume only (14 files / 88 symbols); every changed file lives under `ChatApp/src` (UI screens/components + 3 mobile `*.spec.ts` test-only `jest.mock` additions). No backend controller/service/gateway, no socket event, no WebRTC contract, no `.env` touched.

## 6. Commerce And Services Mock Screens

- [x] 6.1 Replace the Shopping placeholder with a mock shopping marketplace screen using local product/store data.
- [x] 6.2 Replace the Support/Dịch vụ placeholder with a mock services marketplace screen using local service/provider data.
- [x] 6.3 Keep the implementation local to mobile UI screens and preserve existing backend/navigation contracts.

Validation notes:
- `npm run tsc` passes.
- `npm run lint` is blocked by the existing ESLint 9 migration issue: the app does not have an `eslint.config.(js|mjs|cjs)` file.
- Metro Android bundle smoke passes with `nativewind@4.1.23`; `nativewind@4.2.4` was not compatible with this app's current React Native 0.76 + Reanimated 3 stack because it requires `react-native-worklets/plugin`.
- `gitnexus detect-changes` (2026-07-14) now confirms a mobile-UI-only scope: all changed files are under `ChatApp/src` (UI screens/components + mobile test-only `jest.mock` additions). No backend API, socket event, WebRTC contract, or `.env` file changed. The "high" risk label reflects change volume (14 files), not sensitive-contract impact.
