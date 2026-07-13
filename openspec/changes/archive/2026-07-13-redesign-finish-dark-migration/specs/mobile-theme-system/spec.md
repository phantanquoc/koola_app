## MODIFIED Requirements

### Requirement: In-scope screens consume theme via useTheme

In-scope production screens SHALL resolve their colors from `useTheme()` following the reference pattern, rather than importing static `koolaColors`. The in-scope set explicitly includes the high-traffic tier-two surfaces and shared chrome: the shared `KoolaHeader`, `ContactsScreen` (+ `ContactItem`, `ContactSearchBar`), `CallsScreen`, `UniversalSearchScreen` (+ `search/ContactResultItem`, `ConversationResultItem`, `MessageResultItem`), `QrScannerModal`, the chat reply/quote chrome (`QuoteBubble`, `ReplyPreview`, `SwipeableBubble`), `OfflineBanner`, and `LoadingFooter` — in addition to the previously-listed clusters (Auth, Chat chrome, Moments, Connect, Personal). New and re-migrated V2 styling SHALL consume semantic/component tokens via `useTheme().tokens` and build styles from a `useMemo(() => makeStyles(tokens), [tokens])` factory. The `useTheme().palette` field and the `makeStyles(palette)` pattern are RETAINED for backward compatibility with already-migrated screens, but are the legacy pattern and SHALL NOT be the target for new V2 work. Sub-components that need color SHALL receive `tokens` (or, for legacy code, `palette`).

#### Scenario: New V2 styling consumes tokens

- **WHEN** new or re-migrated V2 styling is written for an in-scope screen
- **THEN** it obtains `tokens` from `useTheme()` and builds styles via a `useMemo(() => makeStyles(tokens), [tokens])`-style factory
- **AND** it does not read colors directly from `useTheme().palette`

#### Scenario: Tier-two high-traffic surfaces render correctly in dark

- **WHEN** the shared header, Contacts, Calls, Universal Search, QR scanner, or the reply/quote chat chrome is viewed in dark mode
- **THEN** it resolves its colors from `useTheme().tokens` and reads legibly (no white bar, no dark-on-dark text)
- **AND** it recolors on a light↔dark switch without an app restart

#### Scenario: Legacy palette pattern still supported

- **WHEN** an already-migrated screen continues to use `useTheme().palette` with `makeStyles(palette)`
- **THEN** it compiles and renders unchanged
- **AND** it recolors correctly on a light/dark mode switch

#### Scenario: Migrated screen recolors on mode switch

- **WHEN** the active theme mode changes from light to dark on a migrated in-scope screen
- **THEN** the screen and its sub-components render with the dark values without an app restart

#### Scenario: Intentional statics are excluded from conversion

- **WHEN** a color is intentionally fixed regardless of theme — brand logo colors, media/viewer dark overlays, or faux-blur SVG gradient stops
- **THEN** it is left as an intentional static and NOT converted to a token reference

#### Scenario: Type-check and tests pass after migration

- **WHEN** `npm run tsc` and `jest` run in `ChatApp` after a screen is migrated
- **THEN** type-checking and the existing test suite pass with no new errors introduced by the migration

## ADDED Requirements

### Requirement: Vietnamese copy and accessibility on migrated screens

Migrated in-scope screens SHALL present all user-facing copy in Vietnamese, and their migrated interactive controls SHALL carry accessibility semantics. Raw `<Text>` SHALL be replaced with `KoolaText` and `Touchable*` with `Pressable` (with press feedback) as part of migration. Interactive controls SHALL expose an `accessibilityRole` and, where the visible label is an icon or is otherwise non-descriptive, an `accessibilityLabel`; selectable/tab controls SHALL expose `accessibilityState`. The WebRTC Call screens (`CallScreen`, `IncomingCallScreen`) SHALL be migrated for text, accessibility, and color ONLY — their signaling, ICE/SDP handling, and call-lifecycle logic SHALL NOT be changed.

#### Scenario: No English copy remains on a migrated screen

- **WHEN** a migrated screen (Contacts, Calls, Call, IncomingCall, Universal Search, QR scanner) is rendered
- **THEN** all visible labels, buttons, empty/error states, and alerts are in Vietnamese
- **AND** no English user-facing string remains

#### Scenario: Call control buttons are accessible

- **WHEN** a screen reader inspects the in-call control buttons (mute, speaker, end, flip, toggle camera) or the incoming-call accept/decline buttons
- **THEN** each exposes an `accessibilityRole="button"` and a descriptive `accessibilityLabel`

#### Scenario: Call screen migration does not alter call behavior

- **WHEN** the Call screens are migrated
- **THEN** only presentational code (text, `accessibilityRole`/`accessibilityLabel`, color tokens, `KoolaText`/`Pressable`) changes
- **AND** WebRTC signaling, ICE/SDP handling, and the call-lifecycle logic are unchanged (diff shows no change to those code paths)

### Requirement: Migration reduces design-lint debt

Migrating these screens SHALL measurably reduce the design-lint audit counts (`npm run ui:audit`: `koolaColors`, `rawText`, `touchable`, `hardcodedHex`) relative to the pre-change baseline, with no regression. Where a directory becomes fully clean for a specific design-lint rule, that rule SHALL be escalated to `error` for that directory per the established ratchet; no new rule SHALL be flipped to `error` project-wide.

#### Scenario: Audit counts drop after migration

- **WHEN** `npm run ui:audit` runs after this change
- **THEN** the `koolaColors`, `rawText`, `touchable`, and `hardcodedHex` counts are lower than the recorded baseline (14 / 27 / 34 / 38)
- **AND** no previously-clean file regresses

#### Scenario: Cleaned directory escalates its rule to error

- **WHEN** a directory becomes fully clean for a specific design-lint rule after migration
- **THEN** that rule is set to `error` for that directory
- **AND** no new rule is set to `error` project-wide
