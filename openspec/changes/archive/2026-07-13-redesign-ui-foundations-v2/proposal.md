## Why

The Koola mobile app reads as a flat "2020 prototype" rather than a 2026 product. The root cause is not a missing design system — one exists (`ui-dna.md`, 13 primitives, light/dark palettes, motion/depth tokens) — but three structural gaps: (1) the token layer is a single flat file (`theme.ts`) with no semantic/component indirection, so the visual language is welded to raw color/spacing values and cannot be re-skinned without a risky rescale; (2) the shipped "2026 redesign" leaned into heavy multi-layer glass + shadow, which now reads as *dated ornament* instead of *clean and modern*; and (3) the design-lint ratchet only catches raw hex — it cannot stop raw `<Text>`, `Touchable*`, `koolaColors` imports, magic spacing/radius, or the Hermes `gap`+`flex:1` bug from re-entering migrated code. This change lays the foundation — an additive semantic token architecture, a content-first visual direction expressed through tokens, and a widened lint guardrail — that every later "Koola UI v2" change builds on. It is change #1 of 4 in Track 1 (visual system); it establishes tokens and guardrails only and deliberately migrates no screens.

## What Changes

- **Additive 3-tier token architecture** in `ChatApp/src/ui/`: keep the existing `koolaColors`/`koolaDarkColors`/`koolaSpacing`/`koolaRadii`/`koolaTypography`/`koolaShadows`/`koolaDarkShadows`/`koolaZIndex`/`koolaOpacity` exports **byte-for-byte unchanged** (back-compat), and layer on top of them:
  - **Primitive-alias** tokens (thin references to existing raw values) plus a new additive `SurfaceScale` primitive (`koolaLightSurfaces`/`koolaDarkSurfaces`) as the color source for elevation.
  - **Semantic** tokens via `makeSemanticTokens(palette, surfaces)` — `bg.canvas`; `surface.level0/level1/level2/overlay`; `text.primary/muted/faint/onAction`; `action.primary/primaryPressed/primarySoft`; `signal.selected/unread`; `status.success/warning/danger`; `border.subtle/strong`; `focus.ring`; `link`; `brand.red/blue/green`. Names are locked (see design Token Contract Matrix).
  - **Component** tokens via `makeComponentTokens(semantic)` — e.g. `chatBubble.own.bg`, `tab.active`, `composer.surface`, `tab.dock`, `sheet.surface`. Color/surface fields compose from semantic color tokens; layout/motion fields may use primitive spacing/radius/typography/motion.
- **Consumed via `useTheme().tokens`, not raw `palette`**: production V2 styling uses `const { tokens } = useTheme(); makeStyles(tokens)`. `palette` is retained as legacy-compat only. This modifies the `mobile-theme-system` living spec (which currently mandates `useTheme().palette`).
- **Content-first visual direction expressed through the new tokens**, NOT by rescaling base values: surface-levels replace heavy shadows for elevation, glass is reserved for chrome/overlay (nav dock, sheets, viewers) and never layered over content, and brand hue is reserved for action/signal/status/focus/link/brand-mark groups (neutral `bg.*`/`surface.*`/`text.*` stay neutral). This reconciles with the `koola-component-redesign` living spec (which currently mandates layered depth/shadow on cards and headers) via a MODIFIED delta.
- **Widen the design-lint governance** (split by detection reliability): reliable ESLint rules for raw `<Text>` (exempting `KoolaText.tsx`), `Touchable*`, and `koolaColors` screen imports; a heuristic ESLint rule for magic spacing/radius; and a cross-platform **audit script** (`ChatApp/scripts/ui-design-audit.mjs`, `npm run ui:audit`) for `gap`+`flex:1`-in-row (which no single AST selector can detect). Global `warn`, escalating to `error` only per already-clean directory per rule (no project-wide `error` flip). Token-definition files stay exempt.
- **Update `openspec/ui-dna.md` to "v2"**: document the additive semantic/component token layers, the content-first shift (glass only on chrome, surface-levels over shadow, brand for action/signal only), and record the **backbone decision** — `StyleSheet + useTheme() + makeStyles(tokens)` is the official styling backbone (`makeStyles(palette)` is legacy); NativeWind stays installed but is NOT used in new production code (removal is a separate future chore). **Preserve the 3 uncommitted `ui-dna.md` lines** (intentional accent tint + dead-tap rule) — integrate, do not overwrite.
- **Record the verified migration baseline via the audit script** so change #3 can measure progress. This change migrates **zero** screens.

Explicit non-goals (must hold throughout):
- **No rescale or rename of any existing token value** (`koolaRadii.md` stays 14, typography variant names/sizes/weights unchanged, etc.) — enforced by the existing additive-only requirement.
- **No high-contrast palette** — deferred entirely. The `makeSemanticTokens(palette, surfaces)` factory-input design lets a future change add high-contrast by passing different inputs, with no consumer changes; a half-wired scaffold now would leave mode-resolution questions unanswered.
- **No navigation / information-architecture changes** — that is Track 2 (`redesign-navigation-ia`).
- **No `admin-web` changes** and **no cross-app token pipeline / npm workspaces** — this is mobile-only, single-source-in-ChatApp.
- **No new NativeWind (`className`) usage** in production screens.
- **No `BlurView` reintroduction**; keep `GiftedChat`, `removeClippedSubviews:false`, `freezeOnBlur`; **no perpetual `withRepeat(-1)` reanimated loops**.
- **No icon-library swap** — keep `react-native-vector-icons` (MaterialIcons).
- **No screen migration** of the 16/27/34/40 offenders (deferred to change #3 `redesign-finish-dark-migration`).

## Capabilities

### New Capabilities
<!-- None. This change extends the existing token capability rather than introducing a new one. -->

### Modified Capabilities
- `koola-design-tokens`: Add requirements for (a) the additive semantic + component token tiers via `makeSemanticTokens(palette, surfaces)`/`makeComponentTokens(semantic)` with locked v1 names, (b) the `SurfaceScale` primitive as the color source for `surface.level0/1/2/overlay`, (c) the content-first token direction (brand hue only on action/signal/status/focus/link/brand groups; glass reserved for chrome), (d) the split design-lint governance (reliable ESLint + heuristic ESLint + audit script) applied warn-globally / error-per-clean-directory-per-rule with a `KoolaText.tsx` exemption, and (e) the `StyleSheet + useTheme + makeStyles(tokens)` backbone decision. All strictly additive — the existing additive-only requirement is preserved and reinforced, not altered.
- `mobile-theme-system`: `useTheme()` gains a `tokens: { semantic, component }` value (return shape a strict superset); the "in-scope screens consume theme via useTheme" requirement is MODIFIED so new/re-migrated V2 styling consumes `useTheme().tokens` via `makeStyles(tokens)`, while `useTheme().palette` + `makeStyles(palette)` remain a supported legacy pattern.
- `koola-component-redesign`: the "2026 depth application on production surfaces" requirement is MODIFIED to a content-first depth model — content surfaces default flat (surface-levels + hairlines), cards used only for genuine containment, shadow reserved for floating chrome (dock/menu/sheet/modal); headers and cards are no longer required to carry a shadow.

## Impact

- **Tokens/foundation**: `ChatApp/src/ui/theme.ts` (additive exports only — existing exports untouched; adds `SurfaceScale` type + `koolaLightSurfaces`/`koolaDarkSurfaces`), new token modules `ChatApp/src/ui/tokens/semantic.ts` + `ChatApp/src/ui/tokens/components.ts`, and `ChatApp/src/ui/ThemeProvider.tsx` / `useTheme()` extended to expose `tokens: { semantic, component }` alongside the existing fields.
- **Lint governance**: `ChatApp/eslint.config.mjs` — additional `no-restricted-syntax` / `no-restricted-imports` rules (ratcheted by directory per rule) + `ChatApp/scripts/ui-design-audit.mjs` (audit script) wired as `npm run ui:audit` in `ChatApp/package.json`.
- **Tests**: token-factory unit tests under `ChatApp/src/ui/__tests__/` (or alongside `tokens/`).
- **Docs**: `openspec/ui-dna.md` bumped to v2.
- **Back-compat**: every existing `koolaColors`/`koolaSpacing`/etc. call site renders identically; no primitive or screen is required to adopt semantics in this change.
- **Downstream**: unblocks change #2 (`redesign-primitives-v2` + 3 reference screens), #3 (`redesign-finish-dark-migration`), and #4 (`redesign-screen-uplift`).
- **Dependencies**: no new npm packages.

### Verified migration baseline (recorded for change #3)

Scope: `src/screens` + `src/components`, excluding `__tests__`, `dev/`, and token-definition files. Counted by file.

- `koolaColors` imported in screens/components: **16**
- Raw `<Text>` usage: **27**
- `Touchable*` usage: **34**
- Files containing hardcoded hex: **40**
- NativeWind `className` real usage: **4** (all primitives — `KoolaButton`, `KoolaIconButton`, `KoolaSurface`, `KoolaText`; no screens)

Baseline is produced by the cross-platform audit script (Node, PowerShell-safe — replaces the earlier inline `grep`, which violated `AGENTS.md` and was not portable):
```bash
npm run ui:audit   # runs node scripts/ui-design-audit.mjs from ChatApp/
```
It reports, over the fixed scope (`src/screens` + `src/components`, excluding `__tests__`/`dev`/token defs), the same four counts above plus the `gap`+`flex:1`-in-row findings, in stable text/JSON so change #3 can diff progress.
