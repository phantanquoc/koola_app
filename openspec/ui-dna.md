# UI DNA — Koola App

Design essence distilled from the living codebase. Every UI change must respect these constraints.

---

## Design Tokens

### Colors

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

All UI must reference `koolaColors.*` tokens — never hardcode hex values.

### Spacing

8px base grid. Scale: 4 / 8 / 12 / 16 / 24 / 32. Use `koolaSpacing.*` (xs/sm/md/lg/xl/xxl).

- Inline gaps: 4–8px
- Section padding: 16px horizontal, 12–16px vertical
- Card internal padding: 16px
- Card margin: 16px horizontal, 12px bottom

### Typography

| Variant | Size/LH | Weight | Use for |
|---------|---------|--------|---------|
| title | 24/30 | 800 | Screen titles, brand |
| heading | 20/26 | 700 | Section headers, modal titles |
| body | 15/22 | 400 | Content text |
| label | 14/20 | 600 | Button text, card names |
| caption | 12/16 | 500 | Badges, metadata |

Always use `KoolaText` with variant/tone/weight props — never raw `<Text>` with inline styles.

### Radius

| Token | Value | Use for |
|-------|-------|---------|
| xs | 8px | Small inputs, chips |
| sm | 10px | Buttons, badges |
| md | 14px | Cards, modals |
| lg | 20px | Bottom sheets |
| pill | 999px | Chips, badges, search bars |

### Shadows

- `subtle` — cards, surfaces (offset 3px, opacity 0.08, radius 10)
- `soft` — elevated modals, floating elements (offset 8px, opacity 0.1, radius 18)

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
- Brand mark is a flat geometric tri-arc ring (red/blue/green), drawn as SVG `<Path>` arcs — never raster, never gradient/shadow. Round caps, stroke scales with size; crisp from 24px (app-icon/favicon ready).
- Per-letter wordmark mapping is fixed: K=brandRed, OOL=brandBlue, A=brandGreen — reference `palette.brand*`, never the semantic primary/accent/danger tokens.
- Always render via the `KoolaLogo`/`KoolaMark` primitive — do not rebuild the wordmark inline in screens. Source vector lives at `assets/brand/koola-mark.svg`.

### Skeleton Loading (KoolaSkeleton)
- Match the layout of the real content exactly — prevent layout shift
- Use skeleton color token (`#EEF2F7`)
- Show 3 skeleton items for initial list loads

---

## Interaction & Motion

- Press feedback on all interactive elements — never leave a tap without visual response
- Pressable pattern: track pressed state, apply opacity + subtle scale transform
- Android: use `android_ripple` on Pressable elements
- Modals: bottom sheets use `animationType="fade"`, full-screen pickers use `animationType="slide"`
- Duration: keep transitions under 200ms for interactive feedback
- No spring/bounce animations — keep motion functional and quick

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
- Never hardcode hex colors — always reference `koolaColors.*`
- Never use `TouchableOpacity` for new components — use `Pressable` with explicit press state
- Never nest ScrollView inside FlatList
- Never exceed 2 rows of filter controls above content — collapse into sheet if needed
- Never leave interactive elements without press feedback
- Never use `elevation` without matching `shadow*` properties (cross-platform)
- Never use `gap` in row-direction containers with `flex:1` children — use `marginRight`/`marginLeft` + `flexShrink:0` instead. Hermes on RN 0.76 silently breaks the row, dropping children to new lines.
- Always set `underlineColorAndroid="transparent"` on `TextInput` — Android's default underline shows as a stray line, especially on translucent/glass surfaces.
- Filter bars must not consume more than ~120px of vertical space above content
