## Why

The mobile app currently uses many independent `StyleSheet.create` blocks, which makes the interface harder to keep visually consistent across chat, connect, profile, call, auth, and media screens. A focused mobile UI system will make Koola feel modern and coherent while allowing gradual migration without rewriting chat or call logic.

## What Changes

- Add NativeWind v4 and Tailwind CSS v3.4 configuration for React Native 0.76 compatibility.
- Introduce a Koola mobile design system with shared theme tokens and reusable UI primitives.
- Add modern visual defaults for surfaces, buttons, text, inputs, headers, chips, badges, avatars, empty states, skeletons, and dividers.
- Migrate high-visibility screens and components first: authentication, profile/settings, conversation list, chat header/composer surfaces, connect cards, and common empty/error/loading states.
- Preserve existing navigation, data fetching, chat, media, call, WebRTC, push, and backend contracts.
- Do not introduce breaking API changes.

## Capabilities

### New Capabilities
- `mobile-design-system`: Shared mobile UI theme, primitives, styling framework, and screen migration requirements for the React Native app.

### Modified Capabilities

None.

## Impact

- `ChatApp/package.json` and lockfile: add NativeWind/Tailwind dependencies needed for styling.
- `ChatApp/babel.config.js`, `ChatApp/metro.config.js`, `ChatApp/tailwind.config.js`, `ChatApp/global.css`, and TypeScript declarations: configure NativeWind.
- `ChatApp/src/ui/`: new design system primitives and theme helpers.
- Selected `ChatApp/src/screens/**` and `ChatApp/src/components/**`: migrate high-visibility UI to shared primitives and modern tokenized styles.
- Mobile validation: `npm run tsc`; Android smoke build if dependency setup touches native/bundler configuration.
