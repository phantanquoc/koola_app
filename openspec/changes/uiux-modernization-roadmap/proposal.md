## Why

APP_KOOLA already has a strong mobile and admin UI foundation, but the experience is evolving screen-by-screen instead of through a consistent product-grade UX system. The current UI modernization work should be governed by an OpenSpec change because the user explicitly wants incremental, easy-to-review batches that can be reverted safely if a visual change regresses chat, Moments, navigation, media, or admin workflows.

## What Changes

- Introduce an incremental UI/UX modernization plan for mobile and admin surfaces, implemented in small reviewable batches.
- Harden the mobile `Koola` UI foundation with accessibility, input, and component-state improvements without changing business logic.
- Improve the Moments entry experience first, then progressively polish Moment rings, viewer, composer, and music picker while preserving media/audio lifecycle behavior.
- Improve chat UX clarity around composer controls and visible message states without rewriting message synchronization or the uncontrolled composer input.
- Improve admin-web UX through small reusable primitives, dashboard hierarchy, and business verification trust signals without adopting a heavy UI framework.
- Add accessibility, performance, and regression gates to each major batch so visual improvements remain safe.
- Preserve explicit non-goals until separately approved: no navigation rewrite, no API/service/data-model changes for UI polish, no heavy dependency adoption, no `BlurView` reintroduction in sensitive chat/tab surfaces, no removal of `freezeOnBlur`, and no conversion of `ChatComposer` to a controlled input.

## Capabilities

### New Capabilities
- `uiux-modernization-governance`: Covers the incremental UI/UX modernization process, batch boundaries, safety constraints, review/revert expectations, and validation gates.
- `mobile-koola-ui-foundation`: Covers mobile Koola UI primitives, token usage, accessibility defaults, input behavior, and component-state consistency.

### Modified Capabilities
- `moments-stories`: Adds UX requirements for the Moments entry, ring, viewer, composer, and state presentation without changing story data semantics.
- `moments-music-library`: Adds UX requirements for music picker search, selected-track, preview, loading, empty, and close/stop behavior without changing music API semantics.
- `messaging`: Adds UX requirements for chat composer clarity and visible sending/offline/failure states without changing message transport semantics.
- `admin-web-app`: Adds UX requirements for reusable admin primitives, dashboard hierarchy, responsive operations layout, and consistent loading/empty/error states.
- `admin-business-verification`: Adds UX requirements for trust-oriented business verification queues, reject reason clarity, and review affordances without changing authorization or verification APIs.

## Impact

- Mobile UI primitives and tokens under `ChatApp/src/ui/`.
- Moments surfaces under `ChatApp/src/screens/main/MomentsScreen.tsx`, `ChatApp/src/components/moments/MomentRing.tsx`, `ChatApp/src/screens/moments/MomentViewerScreen.tsx`, `ChatApp/src/screens/moments/MomentComposerScreen.tsx`, and `ChatApp/src/components/moments/MusicPicker.tsx`.
- Chat surfaces under `ChatApp/src/screens/chat/ChatScreen.tsx`, `ChatApp/src/screens/chat/components/ChatComposer.tsx`, and related presentational message components.
- Navigation shell files such as `ChatApp/src/navigation/MainNavigator.tsx` and `ChatApp/src/navigation/ChatTabStack.tsx`, with changes limited to safe visual polish unless explicitly approved.
- Admin web files under `admin-web/src/`, especially `index.css`, `AppLayout.tsx`, `DashboardPage.tsx`, `UsersPage.tsx`, `BusinessesPage.tsx`, and `LoginPage.tsx`.
- No backend API, database schema, Socket.IO event contract, moments service semantics, message sync semantics, authentication flow, or admin authorization changes are intended for this change.
- New lightweight dependencies are not part of the initial scope; any SVG/icon/chart/haptic dependency must be separately justified and approved before implementation.
