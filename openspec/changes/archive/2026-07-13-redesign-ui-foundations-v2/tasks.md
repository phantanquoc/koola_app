## 1. SurfaceScale primitive (additive)

- [x] 1.1 Add `type SurfaceScale = { level0: string; level1: string; level2: string; overlay: string }` plus `koolaLightSurfaces` and `koolaDarkSurfaces` constants to `ChatApp/src/ui/theme.ts` — purely additive, `Palette` type and all existing exports untouched.
- [x] 1.2 Choose light/dark surface values so `level0→level1→level2` are visibly ordered in both palettes (dark levels get progressively lighter), and `overlay` is a scrim base. Validate against WCAG AA where they back text. ← (verify: Palette type + existing exports unchanged; surface levels ordered/distinct in both palettes)

## 2. Semantic + component token layers (additive)

- [x] 2.1 Add `ChatApp/src/ui/tokens/semantic.ts` exporting `makeSemanticTokens(palette: Palette, surfaces: SurfaceScale): SemanticTokens` producing the LOCKED v1 names (see design Token Contract Matrix): `bg.canvas`; `surface.level0/level1/level2/overlay`; `text.primary/muted/faint/onAction`; `action.primary/primaryPressed/primarySoft`; `signal.selected/unread`; `status.success/warning/danger`; `border.subtle/strong`; `focus.ring`; `link`; `brand.red/blue/green`. No raw hex, no rescale of base values.
- [x] 2.2 Enforce content-first hue rule in the semantic layer: brand hue only in `action.*`/`signal.*`/`status.*`/`focus.*`/`link`/`brand.*`; `bg.*`/`surface.*`/`text.*` (except `text.onAction`) stay neutral.
- [x] 2.3 Add `ChatApp/src/ui/tokens/components.ts` exporting `makeComponentTokens(semantic): ComponentTokens` (`chatBubble.own/other`, `tab.active/inactive/dock`, `composer.surface`, `sheet.surface`). Color/surface fields compose from semantic COLOR tokens only; layout/motion fields MAY reference primitive spacing/radius/typography/motion scales. Glass chrome tokens (`tab.dock`, `composer.surface`, `sheet.surface`) conform to the locked `GlassSurface` shape `{ fill, tint, sheen, hairline, bottomLine }` (no BlurView).
- [x] 2.4 Ensure content-surface component tokens (`chatBubble.*`, list rows) use no glass/translucent treatment; only chrome tokens (`tab.dock`, `sheet.surface`) may. ← (verify: locked names present; brand hue only on branded groups; glass only on chrome; no component color token reads raw hex/palette keys)

## 3. useTheme() surface extension (additive superset)

- [x] 3.1 Extend `ChatApp/src/ui/ThemeProvider.tsx` / `useTheme()` to compute `tokens.semantic = makeSemanticTokens(palette, surfaces)` and `tokens.component = makeComponentTokens(tokens.semantic)`, memoized on palette identity, exposed as `tokens: { semantic, component }`.
- [x] 3.2 Verify no existing `useTheme()` return field (`palette`, `mode`, `setMode`, `resolvedScheme`, …) is renamed or removed — the shape is a strict superset. ← (verify: all existing useTheme consumers compile untouched; `tokens` added, nothing removed)

## 4. Design-lint governance (split + ratcheted)

- [x] 4.1 In `ChatApp/eslint.config.mjs`, add global (`warn`) RELIABLE rules: raw `<Text>` JSX (allow `KoolaText`; **exempt `src/ui/KoolaText.tsx`**), `Touchable*` usage, and `koolaColors` import inside `src/screens`/`src/components`.
- [x] 4.2 Add the global (`warn`) HEURISTIC rule for magic-number spacing/radius on style keys. Keep the token-definition exemption (`src/ui/theme.ts`, `src/ui/tokens/**`).
- [x] 4.3 Add per-directory `error` overrides listing the exact directories clean **for each specific rule** (not a blanket "already-clean"); do NOT set any new rule to `error` globally.
- [x] 4.4 Run `eslint` and confirm: unmigrated dirs report new issues at `warn` (build not broken); a seeded regression in a per-rule-clean dir fails at `error`; `KoolaText.tsx` is not flagged. ← (verify: global severity warn; no project-wide error flip; KoolaText exempt; clean dirs error on regression)

## 5. Audit script + baseline

- [x] 5.1 Add `ChatApp/scripts/ui-design-audit.mjs` (Node, cross-platform/PowerShell-safe) counting, over scope `src/screens`+`src/components` excluding `__tests__`/`dev`/token defs: koolaColors imports, raw `<Text>`, `Touchable*`, hardcoded hex, plus `gap`+`flex:1`-in-row findings. Emit stable text + JSON.
- [x] 5.2 Wire `npm run ui:audit` in `ChatApp/package.json`. Confirm it reproduces the recorded baseline (16 / 27 / 34 / 40) and lists gap+flex:1 sites. ← (verify: script runs on this platform; counts match baseline; output stable/reusable by change #3)

## 6. Documentation (ui-dna v2)

- [x] 6.1 Update `openspec/ui-dna.md` to v2 (diff, not rewrite): document primitive→semantic→component tiers and how to consume `useTheme().tokens`. **Preserve the 3 uncommitted working-tree lines** (intentional accent tint + dead-tap) — integrate, do not overwrite.
- [x] 6.2 Document the content-first shift (surface-levels over shadow, glass only on chrome, brand for action/signal only) and record the `StyleSheet + useTheme + makeStyles(tokens)` backbone (`makeStyles(palette)` = legacy; NativeWind installed but not used in new production code).
- [x] 6.3 Preserve still-valid v1 content (motion/spring rules, accessibility baseline, brand-mark flat rule).

## 7. Token-factory unit tests

- [x] 7.1 Add tests: semantic keys complete under light AND dark; `makeSemanticTokens`/`makeComponentTokens` are pure/deterministic; component color tokens contain no raw hex outside token definitions; surface levels differ and are correctly contrast-ordered; existing theme-mode resolution (`resolveMode`/`normalizeMode`) unchanged; existing exports byte-for-byte.

## 8. Verification

- [x] 8.1 Confirm every existing token export in `theme.ts` is byte-for-byte unchanged (diff shows only additions). ← (verify: additive-only holds — no existing value/name changed)
- [x] 8.2 Confirm NativeWind gate: primitive pass-through `className` declarations not increased beyond current count; production call sites passing `className` remain 0; no new primitive gains a `className` prop.
- [x] 8.3 Run type-check, `eslint`, `jest`, and `npm run ui:audit`; confirm green and that no existing call site rendering changed. ← (verify: tsc + eslint + jest pass; back-compat intact; audit reproduces baseline)
