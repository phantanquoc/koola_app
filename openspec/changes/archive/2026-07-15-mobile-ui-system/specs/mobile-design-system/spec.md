## ADDED Requirements

### Requirement: NativeWind styling foundation
The mobile app SHALL support NativeWind v4 utility styling with Tailwind CSS 3.4 in the React Native 0.76 app.

#### Scenario: NativeWind configuration exists
- **WHEN** the mobile project is inspected
- **THEN** it includes Tailwind content paths, NativeWind preset configuration, global CSS import, Babel configuration, Metro configuration, and TypeScript declarations required for `className` styling.

#### Scenario: NativeWind is compatible with current React Native version
- **WHEN** dependencies are installed
- **THEN** the selected NativeWind/Tailwind versions match React Native 0.76 without requiring a React Native 0.81 upgrade.

### Requirement: Shared Koola UI primitives
The mobile app SHALL provide reusable Koola UI primitives for common interface elements.

#### Scenario: Primitives are available
- **WHEN** a screen needs text, surface, button, icon button, text input, avatar, badge, chip, divider, skeleton, or empty/error state UI
- **THEN** the screen can import a shared primitive from `ChatApp/src/ui` instead of redefining a one-off local component.

#### Scenario: Primitives expose states
- **WHEN** a primitive supports interaction or async content
- **THEN** it exposes visual states for default, pressed, disabled, loading, error, and empty content where applicable.

### Requirement: Tokenized visual language
The mobile app SHALL use a shared visual token set for color, spacing, radius, typography, border, and shadow decisions.

#### Scenario: Screen uses visual tokens
- **WHEN** a migrated screen renders common UI
- **THEN** spacing, color, radius, typography, and borders align with the Koola token set rather than arbitrary per-screen values.

#### Scenario: Long text is handled
- **WHEN** translated Vietnamese labels, long names, or long message previews appear in migrated UI
- **THEN** text wraps, truncates, or scales within its container without overlapping adjacent content.

### Requirement: High-visibility screen migration
The mobile app SHALL migrate the most visible mobile surfaces to the shared UI system first.

#### Scenario: Auth and account surfaces are migrated
- **WHEN** the user opens login, register, OTP, profile, edit profile, or settings screens
- **THEN** those screens use the refreshed Koola visual language and shared primitives for their main controls.

#### Scenario: Chat and list surfaces are migrated
- **WHEN** the user opens conversation lists, chat headers, chat composer surfaces, search results, or empty/error/loading list states
- **THEN** those surfaces use the refreshed Koola visual language without changing chat data or socket behavior.

#### Scenario: Connect surfaces are migrated
- **WHEN** the user opens Connect home, business cards, business search, business profile, or create business screens
- **THEN** those surfaces use the refreshed Koola visual language without changing business API behavior.

### Requirement: Behavior preservation
The mobile UI refresh SHALL preserve existing navigation, API, chat, media, WebRTC, push notification, and offline queue behavior.

#### Scenario: Typecheck remains valid
- **WHEN** `npm run tsc` is run in `ChatApp`
- **THEN** the command completes without TypeScript errors caused by the UI migration.

#### Scenario: No backend contract changes
- **WHEN** the UI refresh is reviewed
- **THEN** backend DTOs, REST paths, socket event names, WebRTC event names, and `.env` files are unchanged.
