# UI DNA — Koola App (v2)

Design essence distilled from the living codebase. Every UI change must respect these constraints.

---

## Token Architecture (v2)

The design system follows a 3-tier token hierarchy:

```
Primitive → Semantic → Component
```

- **Primitives** (`theme.ts`): raw values (`koolaColors`, `koolaDarkColors`, `koolaSpacing`, `koolaRadii`, `koolaTypography`, `koolaShadows`, `koolaDarkShadows`, `koolaZIndex`, `koolaOpacity`, `koolaLightSurfaces`, `koolaDarkSurfaces`). These define WHAT colors/sizes exist.
- **Semantic tokens** (`tokens/semantic.ts`): named roles (`bg.canvas`, `text.primary`, `action.primary`, `surface.level1`). These define WHAT each value MEANS in context.
- **Component tokens** (`tokens/components.ts`): per-component token bundles (`chatBubble.own.bg`, `tab.dock`, `composer.surface`). These describe HOW a specific component looks.

### Consuming tokens (V2 pattern)

```ts
const { tokens } = useTheme();
const styles = useMemo(() => makeStyles(tokens), [tokens]);

function makeStyles(t: { semantic: SemanticTokens; component: ComponentTokens }) {
  return StyleSheet.create({
    container: { backgroundColor: t.semantic.bg.canvas },
    bubble: { backgroundColor: t.component.chatBubble.own.bg },
  });
}
```

**Legacy pattern** (still supported, not for new V2 code):
```ts
const { palette } = useTheme();
const styles = useMemo(() => makeStyles(palette), [palette]);
```

### Content-first direction

- **Surface-levels replace shadow** for content elevation. Use `surface.level0/level1/level2` instead of stacking shadows on content cards.
- **Glass is reserved for chrome only**: navigation dock, composer, sheets/modals, viewers. Never on content surfaces (chat bubbles, list rows, cards).
- **Brand hue is reserved for action/signal**: `action.*`, `signal.*`, `status.*`, `focus.*`, `link`, `brand.*` carry brand color. All `bg.*`, `surface.*`, `text.*` (except `text.onAction`) stay neutral.

---

## Design Tokens

### Colors (Primitive Layer)

| Role | Value | Usage |
|------|-------|-------|
| ink | `#101828` | Primary text, headings |
| muted | `#667085` | Secondary text, labels |
| faint | `#98A2B3` | Placeholder, disabled text |
| line | `#E4E7EC` | Borders, dividers |
| canvas | `#F7F9FC` | Page background, input fills |
| surface | `#FFFFFF` | Card/modal backgrounds |
| primary | `#2563EB` | Actions, links, active states |
| primaryDark | `#1D4ED8` | Pressed primary |
| primarySoft | `#DBEAFE` | Primary tint backgrounds |
| accent | `#10B981` | Success-adjacent, secondary brand |
| warm | `#F97316` | Tertiary brand accent |
| danger | `#EF4444` | Destructive actions, errors |
| warning | `#F59E0B` | Caution states |
| success | `#12B76A` | Positive confirmations |

**V2 production code** must reference SEMANTIC tokens via `useTheme().tokens.semantic` — never raw palette keys. The primitive palette remains available as `useTheme().palette` for legacy compatibility.

All UI must reference palette tokens via `useTheme().palette` — never hardcode hex values, never import `koolaColors` directly in screens. The `koolaColors` object defines the light palette; `koolaDarkColors` defines the dark palette. Screens consume whichever is active through `useTheme()`.

Intentional-static exception: per-item accent tints sourced from data (e.g. a product/category's own `accent` hex used as `${accent}18` icon-shell fill) stay literal — they are content, not chrome, and read correctly on both schemes. Everything structural (surface, canvas, line, ink, text) must be palette tokens.

**Figma-auth exception:** Auth screens (`src/screens/auth/*`) that implement a 1:1 Figma design (e.g. `koola-login-redesign`) may use exact Figma hex values via a local `figmaHex()` helper. These are spec-matched colors from the design file, not arbitrary hardcodes. The helper pattern keeps the linter clean and centralizes the Figma color map in one place per screen.

Pattern: `const { palette } = useTheme(); const styles = useMemo(() => makeStyles(palette), [palette]);` (legacy)

**V2 backbone:** `const { tokens } = useTheme(); const styles = useMemo(() => makeStyles(tokens), [tokens]);`

NativeWind (`className`) is installed but NOT used in new production code. Only 4 primitives declare/forward `className`; no screen passes one. Removal is a separate future chore.

### Spacing

8px base grid. Scale: 4 / 8 / 12 / 16 / 24 / 32 / 40 / 48. Use `koolaSpacing.*` (xs/sm/md/lg/xl/xxl/40/48).

- Inline gaps: 4–8px
- Section padding: 16px horizontal, 12–16px vertical
- Card internal padding: 16px
- Card margin: 16px horizontal, 12px bottom

### Typography

| Variant | Size/LH | Weight | Use for |
|---------|---------|--------|---------|
| display | 32/40 | 800 | Hero text, onboarding |
| title | 24/30 | 800 | Screen titles, brand |
| heading | 20/26 | 700 | Section headers, modal titles |
| body | 15/22 | 400 | Content text |
| label | 14/20 | 600 | Button text, card names |
| caption | 12/16 | 500 | Badges, metadata |

Always use `KoolaText` with variant/tone/weight props — never raw `<Text>` with inline styles.

Font scaling: `KoolaText` applies variant-aware `maxFontSizeMultiplier` (content variants body/display ≈1.5; chrome variants caption/label ≈1.3; title/heading ≈1.35). Never set `maxFontSizeMultiplier={1.0}` — that blocks accessibility scaling entirely. Per-instance override is available via the `maxFontSizeMultiplier` prop when layout requires it.

### Radius

| Token | Value | Use for |
|-------|-------|---------|
| xs2 | 4px | Tiny rounding, progress bars |
| xs | 8px | Small inputs, chips |
| sm | 10px | Buttons, badges |
| md | 14px | Cards, modals |
| lg | 20px | Bottom sheets |
| xl | 24px | Large cards, hero surfaces |
| pill | 999px | Chips, badges, search bars |

### Shadows / Depth

Shadow scale (`koolaShadows`): `xs` / `sm` / `md` / `lg` / `xl` plus legacy `subtle` and `soft`.

| Level | Offset | Opacity | Use for |
|-------|--------|---------|---------|
| xs | 1px | 0.05 | Subtle card lift, headers |
| sm | 2px | 0.06 | Standard cards |
| md | 4px | 0.08 | Elevated cards, popovers |
| lg | 8px | 0.10 | Modals, floating elements |
| xl | 12px | 0.12 | Toast, highest elevation |

Dark-mode depth (`koolaDarkShadows`): On dark backgrounds, black shadows are invisible. Elevation is expressed via a lighter elevated surface tint + a subtle top hairline (0.5px white at low alpha). Components select shadow variant by scheme:

```ts
const shadow = resolvedScheme === 'dark' ? koolaDarkShadows.md : koolaShadows.md;
```

### Surface Scale (v2 — content-first elevation)

Surface levels replace heavy shadows for content elevation. Use `tokens.semantic.surface.level0/level1/level2` for background depth instead of shadow stacking.

| Level | Light | Dark | Use for |
|-------|-------|------|---------|
| level0 | `#F2F4F7` | `#0F1419` | Recessed/base surface |
| level1 | `#FFFFFF` | `#1C2026` | Standard content surface |
| level2 | `#FAFBFC` | `#252B33` | Elevated card surface |
| overlay | `rgba(16,24,40,0.6)` | `rgba(0,0,0,0.7)` | Scrim/backdrop |

Levels are visibly ordered (dark levels get progressively lighter). Shadow is still available for floating chrome (dock, menu, sheet, modal) but is no longer the default for cards/content.

### zIndex

| Token | Value | Use for |
|-------|-------|---------|
| hide | -1 | Below-default, background layers |
| base | 0 | Default stacking |
| dropdown | 10 | Popovers, FABs |
| sticky | 20 | Sticky headers, tab bars |
| overlay | 30 | Scrims, dim backgrounds |
| modal | 40 | Modals, bottom sheets |
| toast | 50 | Toasts, snackbars (always on top) |

### Opacity

| Token | Value | Use for |
|-------|-------|---------|
| disabled | 0.4 | Disabled controls |
| pressed | 0.7 | Active press feedback |

### Translucent Surfaces (Glass)

Frosted/glass surfaces are layered, never a single flat alpha fill. Compose from: vertical light-to-tint gradient, top sheen overlay (~50% height, fades to transparent), 1px top highlight line, faint side-edge shines, and a soft cool-tone bottom shadow line. Active tiles within glass use higher white alpha + inner top highlight + colored ambient shadow to read as raised refractive elements.

A sheen overlay must decay to ~0 alpha at its lower edge — a sheen ending on a non-zero alpha step reads as a visible seam across the surface. With no gradient lib available, fake the fade with a few stacked low-alpha bands (1px overlap), not one solid block.

Faux-blur docks (when BlurView is unsafe — see chat_popback_flicker / removeViewAt unmount) layer in this order: SVG vertical gradient fill (white 0.78 → cool-blue 0.62) → primary tint cast → SVG top sheen → 1px side-edge shines → 1px white inner top edge → 1px cool-tone bottom hairline. SVG comes from `react-native-svg` with `Defs` + `LinearGradient` + `Rect`. No `BlurView`, no perpetual reanimated loops.

---

## Component Patterns

### Buttons
- Variants: primary (filled blue), secondary (outlined canvas), ghost (transparent), danger (filled red)
- Sizes: sm (36px), md (46px), lg (52px)
- Always show loading spinner when async, disable during loading
- Press feedback: opacity 0.82 + scale 0.99

### Cards (KoolaSurface)
- Variants: flat, raised (shadow), soft (canvas bg), outline (hairline border)
- Default card pattern: surface bg + hairline border + subtle shadow + md radius
- Cards are Pressable with ripple on Android

### Chips (KoolaChip)
- Pill radius, 34px height, 12px horizontal padding
- Unselected: canvas bg + hairline border, muted text
- Selected: primary bg + primary border, surface text
- Press feedback: opacity 0.78

### Icon Buttons (KoolaIconButton)
- Circular, variants: ghost / soft (canvas bg) / solid (primary bg)
- Default size 40px, icon 22px
- Press feedback: opacity 0.78 + scale 0.98

### Empty/Error States (KoolaState)
- Centered layout with icon shell (58px, primarySoft bg, lg radius)
- Heading + optional body + optional action button
- Used for empty lists, error recovery, offline states

### Badges (KoolaBadge)
- Pill shape, tones: primary/success/warning/danger/muted
- Soft background + matching text color
- Caption variant, weight 700

### Brand Logo (KoolaLogo / KoolaMark)
- **Mark** (the tri-arc ring) stays flat: geometric red/blue/green SVG `<Path>` arcs — never raster, never gradient/shadow. Round caps, stroke scales with size; crisp from 24px (app-icon/favicon ready). The mark's flat rule is non-negotiable.
- **Wordmark** may be dimensional: the `KoolaLogo` primitive exposes visual `variant`s (`flat` = original default; plus `extruded`, `tilt`, `hero`, `outline`, `bevel`, `longshadow`, `sticker`, `mono`, `underline`), a `font` option, and one-shot entrance `animation`s. Depth/shadow treatments apply to the WORDMARK letters only — never to the mark.
- Per-letter wordmark color mapping is fixed across every variant: K=brandRed, OOL=brandBlue, A=brandGreen — reference `palette.brand*`, never the semantic primary/accent/danger tokens.
- Production headers (`KoolaHeader`, `ServicesHomeScreen`, `ShoppingHomeScreen`) render the wordmark with `variant="extruded"` + `font="sora"`. Default (no props) remains `flat`/`system` — identical to the original, so any call site that passes nothing is unchanged.
- Always render via the `KoolaLogo`/`KoolaMark` primitive — never rebuild the wordmark inline in screens. Source vector lives at `assets/brand/koola-mark.svg`. `LogoLabScreen` (`__DEV__` only) is the playground for previewing variants/fonts/animations.

### Skeleton Loading (KoolaSkeleton)
- Match the layout of the real content exactly — prevent layout shift
- Use skeleton color token (`#EEF2F7`)
- Show 3 skeleton items for initial list loads

### Moments Gradient Ring (MomentRing)
- Unseen stories: gradient stroke via `react-native-svg` (`Defs` + `LinearGradient` + `Circle` stroke). Multi-stop gradient from warm to primary for visual punch.
- Seen stories: muted single-color stroke (palette.line or faint).
- No `react-native-linear-gradient` dependency — SVG-only approach using the already-installed `react-native-svg`.
- Ring wraps the user avatar; size scales with avatar prop.
- Never use a flat solid border for unseen state — the gradient ring is the Moments visual signature.

---

## Interaction & Motion

- Press feedback on all interactive elements — never leave a tap without visual response
- Pressable pattern: track pressed state, apply opacity + subtle scale transform
- Android: use `android_ripple` on Pressable elements
- Modals: bottom sheets use `animationType="fade"`, full-screen pickers use `animationType="slide"`

### Duration tokens (`koolaDurations`)

| Token | Value | Use for |
|-------|-------|---------|
| fast | 120ms | Micro-interactions: button press, icon swap, checkbox |
| normal | 180ms | Standard transitions: fade, scale, slide |
| slow | 280ms | Navigation/modal transitions, complex choreography |

- Micro-interactions MUST stay under 200ms (`fast` or `normal`)
- Navigation/modal transitions may extend to ~300ms (`slow`)

### Spring rules (reconciled)

- Spring animations (`withSpring`) are allowed ONLY for direct-manipulation gestures: image zoom/pan, drag release, pinch snap-back
- Decorative spring/bounce on chrome elements (tab bars, buttons, headers) is BANNED
- No perpetual `withRepeat(-1)` reanimated loops — the dead tab-dock loops gated behind `DIAG_STATIC_TABDOCK` remain gated dead
- Animated chrome borders: use a ONE-SHOT light trace (bright dash sweeps the perimeter once via SVG `strokeDashoffset`, then fades) that plays ONCE on first mount and rests permanently for the rest of the session — never a looping gradient, never re-triggered on focus. Same sanctioned category as `KoolaLogo` entrances. When such a border is combined with a static resting gradient stroke, that combination must be gated per caller (opt-in prop) so headers used across multiple screens keep the static neutral default.

### Easing curves (`koolaEasing`)

- `decelerate` — enter animations (element appearing)
- `accelerate` — exit animations (element leaving)
- `standard` — symmetric transitions (toggle, crossfade)

### Reduce motion

Use `prefersReducedMotion()` from `ui/tokens/motion` to skip animations when the user has enabled reduce-motion system setting.

---

## Accessibility Baseline

- Every interactive element needs `accessibilityRole` (button, tab, link)
- Selected/active states need `accessibilityState={{ selected: true }}`
- Tab bars need `role="tablist"` on container, `role="tab"` on items
- Minimum touch target: 44px (follow iOS HIG)
- Text contrast: ink on surface = 15.4:1, muted on surface = 4.6:1 (AA pass for 15px+)
- Labels: use descriptive `accessibilityLabel` that includes context (e.g., "Xem ho so TenDN")

---

## Voice & Tone

- Vietnamese UI copy — casual-professional, second person ("ban")
- Action labels: imperative, short (2-3 words max): "Ket noi ngay", "Xem ho so", "Thu lai"
- Empty states: empathetic title + helpful suggestion + optional action
- Error messages: state what happened + what user can do

---

## Layout & Responsive

- Single-column mobile layout, no breakpoints (React Native)
- FlatList for scrollable content — never ScrollView wrapping dynamic lists
- Pull-to-refresh on all list screens (RefreshControl, tintColor = primary)
- Infinite scroll with `onEndReachedThreshold={0.3}`
- Header pattern: fixed top with search + action icons, content scrolls beneath
- Filter bars: sticky between header and content, max 2 visible rows before content

---

## Anti-Patterns

- Never use raw `<Text>` — always `KoolaText` with semantic variant/tone
- Never hardcode hex colors — always reference palette tokens via `useTheme().palette`; `koolaColors`/`koolaDarkColors` are only for the token definition file
- Never use `TouchableOpacity` for new components — use `Pressable` with explicit press state
- Never nest ScrollView inside FlatList
- Never exceed 2 rows of filter controls above content — collapse into sheet if needed
- Never leave interactive elements without press feedback
- Never leave a control that looks tappable inert — mock/placeholder surfaces acknowledge taps with a coming-soon toast, never a dead tap
- Never use `elevation` without matching `shadow*` properties (cross-platform)
- Never use `gap` in row-direction containers with `flex:1` children — use `marginRight`/`marginLeft` + `flexShrink:0` instead. Hermes on RN 0.76 silently breaks the row, dropping children to new lines.
- Always set `underlineColorAndroid="transparent"` on `TextInput` — Android's default underline shows as a stray line, especially on translucent/glass surfaces.
- Filter bars must not consume more than ~120px of vertical space above content
