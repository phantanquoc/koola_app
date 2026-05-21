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
- [ ] 3.3 Migrate media display wrappers only where visual styling is isolated from upload/playback logic. ← (verify: image/video rendering behavior remains unchanged)

## 4. Screen Migration

- [x] 4.1 Migrate auth screens (`LoginScreen`, `RegisterScreen`, `OtpVerifyScreen`) to refreshed Koola UI primitives.
- [x] 4.2 Migrate account screens (`ProfileScreen`, `EditProfileScreen`, `SettingsScreen`) to refreshed Koola UI primitives.
- [x] 4.3 Migrate conversation/home/search screens (`ChatHomeScreen`, `ConversationListScreen`, `UniversalSearchScreen`, `ContactsScreen`) to refreshed Koola UI primitives. ← (note: `ChatHomeScreen` and `ConversationListScreen` migrated; `UniversalSearchScreen` not yet migrated)
- [ ] 4.4 Migrate chat chrome (`ChatScreen` header/composer/action surfaces only) without changing message send/read/media logic.
- [x] 4.5 Migrate Connect screens (`ConnectHomeScreen`, `BusinessSearchScreen`, `BusinessProfileScreen`, `CreateBusinessScreen`) to refreshed Koola UI primitives. ← (verify: all migrated screens use shared tokens/primitives for main controls and preserve navigation/API calls)

## 5. Validation

- [x] 5.1 Run `npm run tsc` in `ChatApp`.
- [x] 5.2 Run mobile lint if the ESLint config is available; otherwise document the existing ESLint 9 config blocker.
- [x] 5.3 Run Android Metro/build smoke check after NativeWind setup.
- [ ] 5.4 Run `npx gitnexus detect-changes` from repo root and confirm affected scope is limited to mobile UI plus OpenSpec artifacts. ← (verify: no backend APIs, socket events, WebRTC contracts, or `.env` files changed)

## 6. Commerce And Services Mock Screens

- [x] 6.1 Replace the Shopping placeholder with a mock shopping marketplace screen using local product/store data.
- [x] 6.2 Replace the Support/Dịch vụ placeholder with a mock services marketplace screen using local service/provider data.
- [x] 6.3 Keep the implementation local to mobile UI screens and preserve existing backend/navigation contracts.

Validation notes:
- `npm run tsc` passes.
- `npm run lint` is blocked by the existing ESLint 9 migration issue: the app does not have an `eslint.config.(js|mjs|cjs)` file.
- Metro Android bundle smoke passes with `nativewind@4.1.23`; `nativewind@4.2.4` was not compatible with this app's current React Native 0.76 + Reanimated 3 stack because it requires `react-native-worklets/plugin`.
- `gitnexus detect-changes` cannot confirm a limited UI-only scope because this working tree already contains broad pre-existing mobile/backend changes outside the UI work.
