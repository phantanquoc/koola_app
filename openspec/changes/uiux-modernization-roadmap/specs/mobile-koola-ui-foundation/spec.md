## ADDED Requirements

### Requirement: Koola primitive accessibility defaults
Mobile Koola primitives SHALL expose accessible roles and states for interactive elements without requiring every screen to duplicate common accessibility state logic.

#### Scenario: Button exposes disabled and busy states
- **WHEN** a Koola button is disabled or loading
- **THEN** the rendered pressable SHALL expose button role and accessibility state that identifies disabled and busy status

#### Scenario: Icon button exposes disabled state
- **WHEN** a Koola icon button is disabled
- **THEN** the rendered pressable SHALL expose button role and disabled accessibility state

### Requirement: Android text input underline suppression
Koola text inputs SHALL suppress Android's platform underline by default.

#### Scenario: Koola text input renders on Android
- **WHEN** a `KoolaTextInput` is rendered
- **THEN** the underlying `TextInput` SHALL set `underlineColorAndroid` to `transparent` unless a later explicitly-scoped design changes the input implementation

### Requirement: Token-first mobile visual changes
Mobile UI modernization SHALL use existing Koola tokens and primitives before introducing new colors, typography styles, or ad-hoc components.

#### Scenario: Screen receives UI polish
- **WHEN** a mobile screen is updated for UI/UX polish
- **THEN** the update SHALL use `KoolaText`, `KoolaSurface`, `KoolaButton`, `KoolaIconButton`, `KoolaState`, `KoolaSkeleton`, and `koolaColors`/`koolaSpacing` tokens where those primitives cover the need

#### Scenario: New token is needed
- **WHEN** an existing token does not represent a required semantic state
- **THEN** the implementation SHALL add a narrowly-scoped semantic token rather than hardcoding a new hex color in screen code

### Requirement: Mobile foundation preserves current behavior
Foundation-level UI primitive changes SHALL be additive and SHALL NOT change feature behavior unless the batch explicitly scopes that behavior change.

#### Scenario: Primitive receives accessibility hardening
- **WHEN** accessibility state is added to a Koola primitive
- **THEN** existing visual layout, event handlers, navigation behavior, and service calls SHALL remain unchanged
