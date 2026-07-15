## Context

The React Native app is a bare React Native 0.76.9 project. It already has navigation, media, calls, chat realtime, and push notification flows in place, but most screens define styles locally with `StyleSheet.create`. That makes the UI harder to evolve because spacing, color, typography, radius, and component states are repeated screen by screen.

NativeWind v5 is not selected because it is still preview-oriented and is designed around newer React Native assumptions. This app will use NativeWind v4 with Tailwind CSS 3.4 so the styling framework matches React Native 0.76.9 with less bundler risk.

## Goals / Non-Goals

**Goals:**

- Add a reusable Koola mobile UI system without changing backend contracts.
- Use NativeWind v4 for utility styling and theme tokens.
- Create shared primitives in `ChatApp/src/ui` that screens can reuse gradually.
- Modernize high-visibility mobile surfaces first: auth, home lists, chat surfaces, connect cards, profile/settings, and common states.
- Keep existing React Navigation, WebRTC, Socket.IO, media upload, push notification, and data fetching behavior intact.
- Support loading, error, empty, disabled, pressed, and long-text states in the shared primitives.

**Non-Goals:**

- Replacing React Navigation.
- Rewriting the chat message engine, WebRTC stack, media pipeline, or backend APIs.
- Migrating every screen in one large pass if it risks breaking active call/video-message work.
- Adding React Native Paper, Tamagui, or another full UI kit as the primary design system.
- Changing production API URLs, auth/session behavior, or `.env` files.

## Decisions

1. **Use NativeWind v4, not v5**
   - Rationale: NativeWind v4 matches the current React Native 0.76 app better; NativeWind v5 requires newer React Native assumptions and is a larger bundler migration.
   - Alternative considered: NativeWind v5. Rejected for now due to RN 0.76 compatibility risk.

2. **Build Koola primitives instead of adopting a full UI kit**
   - Rationale: Chat apps need custom message rows, media previews, call screens, and list ergonomics. A small internal UI layer gives consistency without forcing generic UI-kit patterns onto chat/call experiences.
   - Alternative considered: React Native Paper. Rejected as the primary direction because it would make the app strongly Material-styled and less brand-specific.
   - Alternative considered: Tamagui. Rejected for this phase because it adds compiler/config complexity not needed for a mobile-only app.
   - Alternative considered: gluestack-ui. Deferred to a later phase for selected complex components if needed.

3. **Keep migration incremental**
   - Rationale: The worktree already contains broad changes in chat, media, calls, notifications, and users. A UI migration must not destabilize those flows.
   - Implementation direction: Add shared primitives and migrate selected high-visibility surfaces first; leave deep logic and risky media/call internals untouched unless only styling is changed.

4. **Theme via tokens**
   - Rationale: Modern UI polish depends on consistent use of color, typography, spacing, radius, and shadows. Tokens should be available to NativeWind classes and TypeScript code.
   - Implementation direction: define Tailwind theme values plus TypeScript token exports for cases that still use StyleSheet or imperative style props.

## Risks / Trade-offs

- NativeWind setup can fail silently if Babel/Metro/global CSS is incomplete → Add the minimal framework-less configuration, import `global.css` once, add TypeScript declarations, and verify with `npm run tsc`.
- Large UI migration can conflict with active uncommitted work → Scope edits to mobile UI files and avoid backend or WebRTC logic changes unless a visual component directly requires it.
- Utility classes can become inconsistent if used ad hoc → Provide `src/ui` primitives and prefer primitives over raw repeated class strings.
- Some third-party components may not accept `className` → Use existing `StyleSheet` or token-based inline styles for those components rather than forcing NativeWind everywhere.
- Android/iOS visual differences may surface after bundler changes → Keep setup minimal and run typecheck plus Android build/smoke when feasible.

## Migration Plan

1. Add NativeWind v4 dependencies and configuration.
2. Add `global.css`, Tailwind config, and NativeWind TypeScript declaration.
3. Create `ChatApp/src/ui` primitives and theme tokens.
4. Migrate high-visibility shared components and screens in small groups.
5. Run `npm run tsc` after each meaningful migration group.
6. Run Android debug build or Metro smoke test after dependency/config changes.

Rollback strategy: remove NativeWind imports/config and keep `src/ui` primitives implemented with plain React Native styles if the bundler integration blocks development.

## Open Questions

- Whether to add gluestack-ui later for complex overlays such as bottom sheets and action sheets after the first NativeWind-based pass is stable.
- Whether final dark mode should follow system theme immediately or ship after the first visual refresh. The primitives should be designed so dark mode can be added without another rewrite.
