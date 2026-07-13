## Context

The mobile app (`ChatApp/`, RN 0.76) styles via `StyleSheet` + a single flat token file, `ChatApp/src/ui/theme.ts` (299 lines: `koolaColors`, `koolaDarkColors`, `koolaSpacing`, `koolaRadii`, `koolaTypography`, `koolaShadows`, `koolaDarkShadows`, `koolaZIndex`, `koolaOpacity`, plus `Palette` type and `resolveMode`/`normalizeMode`). Screens consume the active palette through `useTheme()` (30 files migrated) but there is no semantic or component indirection — colors like "the background behind a chat bubble" are expressed as raw palette keys at each call site. The archived `koola-design-tokens` spec enforces an **additive-only** rule: existing token values and names must not be rescaled or renamed.

The shipped "2026 redesign" pushed a heavy multi-layer glass + shadow aesthetic (documented in `ui-dna.md`). The user's verdict is that this reads as dated ornament, and the agreed direction (fork B) is **content-first**: reduce decoration, use surface-levels instead of shadow-spam, reserve glass for chrome, reserve brand color for actions.

`eslint.config.mjs` already ratchets a raw-hex rule to `error` for `src/ui`, `src/screens/auth`, `src/screens/connect`, `src/components/moments`, but catches nothing else. NativeWind v4 is installed but only 4 primitives pass `className`; no screen uses it.

This is change #1 of 4 in Track 1. Its job is foundation only: tokens + lint. It migrates no screens and touches no navigation, no `admin-web`, no cross-app pipeline.

## Goals / Non-Goals

**Goals:**

- Add a primitive → semantic → component token architecture **on top of** the existing flat tokens, consumed by production styling through a new `tokens` value on `useTheme()` (not raw `palette`).
- Encode the content-first direction (surface-level elevation, glass-for-chrome, brand-for-action-and-signals) in semantic/component tokens without rescaling any base value.
- Extend the design-lint ratchet to cover raw `<Text>`, `Touchable*`, `koolaColors` screen imports, and magic spacing/radius via ESLint; cover `gap`+`flex:1` via an audit script — warn-global, error only in already-clean dirs.
- Record `StyleSheet + useTheme() + makeStyles(tokens)` as the official backbone in `ui-dna.md` (v2); `makeStyles(palette)` is retained only as a legacy pattern.
- Preserve 100% back-compat: every existing call site renders identically.

**Non-Goals:**

- Rescaling/renaming any existing token (additive-only preserved).
- **High-contrast palette** — deferred entirely (was in an earlier draft; removed — see Decision 4). A future change adds it by extending the semantic factory input, with no consumer changes.
- Migrating the 16/27/34/40 offender files (change #3).
- Building/altering primitives or the 3 reference screens (change #2).
- Navigation/IA changes (Track 2); `admin-web`; cross-app token pipeline / npm workspaces.
- New NativeWind usage; removing NativeWind (separate future chore).
- `BlurView`, perpetual reanimated loops, icon-library swap, or touching `GiftedChat`/`removeClippedSubviews`/`freezeOnBlur`.

## Decisions

### 1. Production styling consumes `tokens`, not `palette`

- **Choice**: `useTheme()` gains a `tokens: { semantic, component }` value. The official V2 backbone is `const { tokens } = useTheme(); const styles = useMemo(() => makeStyles(tokens), [tokens]);`. The existing `palette` field is retained ONLY as a legacy-compat escape hatch; `makeStyles(palette)` is documented as the legacy pattern, not the V2 pattern.
- **Rationale**: The entire point of the semantic layer is to stop screens depending directly on palette. If V2 code still received `palette`, the semantic layer would be trivially bypassed and would rot. Routing production styling through `tokens` makes the indirection the path of least resistance.
- **Consequence**: This modifies the `mobile-theme-system` living spec, which currently mandates screens resolve color from `useTheme().palette` via `makeStyles(palette)` (`mobile-theme-system:147-159`). A MODIFIED delta is required (see Decision 6) so the two sources of truth do not conflict.
- **Alternatives**: Keep exposing only `palette` and build semantics on top ad-hoc — rejected, reintroduces the coupling this change exists to remove.

### 2. Semantic factory takes `(palette, surfaces)`; component tokens split color vs layout

- **Choice**: `ChatApp/src/ui/tokens/semantic.ts` exports `makeSemanticTokens(palette: Palette, surfaces: SurfaceScale)` returning `{ bg, text, action, signal, status, border, surface, focus, brand, link }` groups built by referencing the inputs (no raw hex, no rescale). `ChatApp/src/ui/tokens/components.ts` exports `makeComponentTokens(semantic)`.
- **Component-token scope rule**: component **color/surface** tokens SHALL compose from semantic **color** tokens only; component **layout/motion** tokens MAY reference the existing primitive spacing/radius/typography/motion scales. This lets a component token fully describe a component (not just its palette) without smuggling raw hex.
- **Rationale**: A `makeSemanticTokens(palette)`-only signature cannot source two distinct neutral elevated surfaces (the base `Palette` has just `canvas`/`surface`/`line`) — see Decision 3. Splitting color vs layout scope prevents `components.ts` from being either a misnamed color map or an under-powered token set.
- **Alternatives**: Mixing raw palette keys into component tokens — rejected, defeats the indirection. Runtime color-mixing to derive surface levels — rejected, non-deterministic and unspecced.

### 3. Surface levels sourced from a new additive `SurfaceScale` primitive

- **Choice**: Add `type SurfaceScale = { level0: string; level1: string; level2: string; overlay: string }` plus `koolaLightSurfaces` and `koolaDarkSurfaces` constants to `theme.ts` (purely additive). Semantic `surface.*` resolves to `surface.level0/level1/level2` (numeric-suffix names like `surface.1` are NOT used — property-number keys are awkward and easy to typo).
- **Rationale**: Gives elevation a concrete, per-palette color source with clear light/dark contrast ordering, without inventing values at runtime or abusing `line` as a background. Keeps `Palette` and every existing export untouched.
- **Alternatives**: Reuse `canvas`/`surface`/`line` — rejected, only yields ~2 usable neutrals and overloads `line`. Add surface keys into `Palette` — rejected, would alter the existing `Palette` shape used by 30 consumers.

### 4. `useTheme()` return shape is extended additively (a strict superset)

- **Choice**: `useTheme()` keeps returning `{ palette, mode, setMode, resolvedScheme, ... }` and gains `tokens`. No existing field is renamed or removed; `tokens.semantic`/`tokens.component` are memoized on palette identity.
- **Rationale**: 30 files already destructure `palette`/`mode`/`resolvedScheme`; they must keep compiling untouched. `tokens` adoption is opt-in and lands in later changes.

### 5. High-contrast deferred entirely (removed from this change)

- **Choice**: Do NOT add a high-contrast palette or resolver path in this change. Because `makeSemanticTokens` already takes its palette (and surfaces) as inputs, a future change can introduce high-contrast by passing different inputs — with zero consumer changes.
- **Rationale**: A scaffold here would leave unanswered questions that belong to a dedicated change: does `resolvedScheme` return `light`/`dark`/`highContrast`? Is high-contrast a mode or an accessibility override? How do the navigation theme and dark-shadow selection branch? Which color pairs must be contrast-tested? Shipping the factory-input seam is enough; a half-wired palette is not.
- **Alternatives**: Keep the scaffold — rejected; the factory-input design already preserves future extensibility, so the scaffold adds risk without buying flexibility.

### 6. Lint split: reliable ESLint · heuristic ESLint · audit script

- **Choice**: Split the guardrails by how reliably a linter can detect them:
  - **Reliable ESLint** (`no-restricted-syntax`/`no-restricted-imports`): raw `<Text>` JSX (allow `KoolaText`; **exempt `src/ui/KoolaText.tsx`**, which must render raw RN `<Text>`), `Touchable*` usage, `koolaColors` import under `src/screens`/`src/components`.
  - **Heuristic ESLint**: magic-number spacing/radius on style keys (may need justified `eslint-disable`).
  - **Audit script** (not ESLint): `gap`+`flex:1`-in-row detection lives in `ChatApp/scripts/ui-design-audit.mjs`, because the `gap` (parent style) / `flex:1` (child style) relationship is a render-tree relationship a single AST selector cannot see.
  - Global severity `warn`; per-directory `error` overrides list the exact directories that are clean **per rule** (not a blanket "already-clean"). Token-definition files (`src/ui/theme.ts`, `src/ui/tokens/**`) stay exempt.
- **Rationale**: Encoding `gap`+`flex:1` as a naive selector would give false confidence; an audit script can reason about it and doubles as the progress meter for change #3. The `KoolaText.tsx` exemption prevents the primitive that legitimately wraps raw `<Text>` from tripping its own rule.
- **Alternatives**: (a) Project-wide `error` now — rejected, breaks 40+ files and blocks incremental cleanup. (b) One custom ESLint plugin for everything — heavier than needed and still can't see parent/child render relationships.

### 7. Baseline via cross-platform audit script, not inline `grep`

- **Choice**: Replace the inline `grep` baseline (violates `AGENTS.md`; not PowerShell-portable) with `ChatApp/scripts/ui-design-audit.mjs`, run via `npm run ui:audit`, emitting stable text/JSON. It counts the same four metrics (koolaColors/raw-Text/Touchable/hex) plus the `gap`+`flex:1` audit, over the fixed scope (`src/screens`+`src/components`, excluding `__tests__`/`dev`/token defs). Change #3 reuses it to measure progress.
- **Rationale**: One reproducible, cross-platform source of truth for the debt numbers; no shell-portability landmines.

### 8. `ui-dna.md` bumped in place to v2 (diff, not rewrite)

- **Choice**: Edit `ui-dna.md` to document the semantic/component tiers, the content-first shift, and the backbone decision (`makeStyles(tokens)`) — preserving existing structure and still-valid v1 content (motion, a11y, brand-mark rules). **Preserve the 3 uncommitted lines** already in the working tree (intentional accent tint + dead-tap rule) — integrate, do not overwrite.
- **Rationale**: v1 has real, still-true value (locked motion/spring rules, brand-mark flat rule). A diff keeps provenance and avoids clobbering in-flight edits.

### 9. NativeWind quality gate is call-site-aware

- **Choice**: The gate is not "≤4 files use `className`" but: pass-through `className` **prop declarations** in primitives stay ≤4; production **call sites** that pass `className` stay at **0**; no new primitive gains a `className` prop.
- **Rationale**: The 4 existing files only *declare/forward* `className`; no screen actually passes one. The meaningful regression to prevent is a screen starting to use NativeWind, which the call-site metric catches.

## Risks / Trade-offs

- **Semantic naming churn** → If names are wrong, every later change inherits the mistake. Mitigation: names are LOCKED now via the Token Contract Matrix (validated against the three reference-screen roles), so downstream changes build on a stable API; additions are allowed, renames require a spec change.
- **`useTheme()` memoization cost** → Adding `tokens` computation per palette change. Mitigation: memoize keyed on palette identity (same pattern as `makeStyles`); palette identity changes rarely (mode switch / OS scheme change).
- **Lint false positives** (magic-number, `gap`+`flex:1` heuristics) → Could annoy in unmigrated code. Mitigation: warn-global (non-blocking); refine selectors; allow justified `eslint-disable`.
- **Accidental non-additive edit** to `theme.ts` → Would violate the spec. Mitigation: existing hex-rule exemption on `theme.ts` stays; tasks explicitly require existing exports remain byte-for-byte; a diff review step verifies no existing export line changed.
- **Scope creep into primitives/screens** → Tempting to "just adopt semantics somewhere." Mitigation: non-goal stated; adoption belongs to #2+.

## Token Contract Matrix (v1 — locked in this change)

The semantic/component names below are the public API this change ships. They are locked here — NOT deferred to change #2 — because a wrong name would force a foundation edit after downstream consumers exist. Names are validated conceptually against the three reference-screen roles (Conversation List, Chat Room, Settings). New names MAY be added additively later; existing names here SHALL NOT be renamed without a spec change.

| Role | Conversation List | Chat Room | Settings | Token |
|------|-------------------|-----------|----------|-------|
| Page background | list canvas | chat canvas | screen canvas | `bg.canvas` |
| Primary content surface | row surface | bubble/content surface | section surface | `surface.level1` |
| Raised content surface | — | — | grouped card | `surface.level2` |
| Overlay/scrim base | — | image/story scrim | sheet backdrop | `surface.overlay` |
| Primary text | name/title | message text | row label | `text.primary` |
| Secondary text | preview/time | meta/time | row value/hint | `text.muted` |
| Tertiary text | — | timestamp faint | disabled hint | `text.faint` |
| Primary action | FAB/compose | send | primary button | `action.primary` |
| Selected signal | active row | reaction selected | segment selected | `signal.selected` |
| Unread signal | unread dot/badge | — | badge | `signal.unread` |
| Status | — | delivery/read tick | success/warn/danger | `status.success` / `status.warning` / `status.danger` |
| Focus ring | focused input | composer focus | focused field | `focus.ring` |
| Divider/hairline | row separator | day divider | row separator | `border.subtle` |
| Link | — | link in message | link | `link` |
| Brand mark colors | logo | — | logo | `brand.red` / `brand.blue` / `brand.green` |
| Floating chrome (glass) | search/menu | composer dock | sheet surface | `component.tab.dock` / `component.composer.surface` / `component.sheet.surface` |

TypeScript shape (locked):

```ts
type SurfaceScale = { level0: string; level1: string; level2: string; overlay: string };

type SemanticTokens = {
  bg: { canvas: string };
  surface: { level0: string; level1: string; level2: string; overlay: string };
  text: { primary: string; muted: string; faint: string; onAction: string };
  action: { primary: string; primaryPressed: string; primarySoft: string };
  signal: { selected: string; unread: string };
  status: { success: string; warning: string; danger: string };
  border: { subtle: string; strong: string };
  focus: { ring: string };
  link: string;
  brand: { red: string; blue: string; green: string };
};

// Glass chrome surface — the faux-glass layer shape (no BlurView). Values are
// resolved colors/alphas, composed from semantic tokens. Locked so the token
// module and its first consumer (change #2) agree on the shape.
type GlassSurface = {
  fill: string;        // base translucent fill
  tint: string;        // brand/cool cast over the fill
  sheen: string;       // top specular highlight color (fades to transparent)
  hairline: string;    // 1px inner top edge
  bottomLine: string;  // cool-tone bottom hairline
};

type ComponentTokens = {
  chatBubble: { own: { bg: string; text: string }; other: { bg: string; text: string } };
  tab: { active: string; inactive: string; dock: GlassSurface };
  composer: { surface: GlassSurface };
  sheet: { surface: GlassSurface };
};

type ThemeContextValue = {
  palette: Palette;            // legacy compatibility — do not use in new V2 code
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  resolvedScheme: 'light' | 'dark';
  tokens: { semantic: SemanticTokens; component: ComponentTokens };  // V2 backbone
};
```

## Migration Plan

1. Land the additive `SurfaceScale` primitive (`koolaLightSurfaces`/`koolaDarkSurfaces`) + token modules (`semantic.ts`, `components.ts`) + extended `useTheme()` (`tokens`) — nothing consumes them yet, so risk is near-zero.
2. Add the audit script (`ui:audit`) and land extended lint rules at `warn` global + `error` for the per-rule clean dirs; run `eslint` to confirm no unmigrated build breaks.
3. Update `ui-dna.md` to v2 (integrating the 3 uncommitted lines).
4. Add token-factory unit tests.
5. Run type-check + lint + jest to confirm green and that existing call sites are unaffected.

**Rollback**: Purely additive — reverting the token modules, the `useTheme()` additions, the audit script, and the lint block restores prior behavior with no call-site changes to undo.

## Open Questions

- Number of surface levels — locked at `level0/level1/level2 + overlay` for v1; extend additively if a reference screen needs more.
- Exact hex values for `koolaLightSurfaces`/`koolaDarkSurfaces` and the `signal`/`status`/`focus` tokens — chosen at implementation against WCAG AA on their intended backgrounds; names are locked (matrix above), values are an implementation detail.
