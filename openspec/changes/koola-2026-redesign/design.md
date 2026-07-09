## Context

The Koola mobile app (React Native 0.76, Fabric/New Architecture) has a mature but visually dated UI. A design system already exists — 11 `Koola*` primitives, a light+dark `Palette` in `theme.ts`, a working `ThemeProvider`/`useTheme()`, and `ui-dna.md` governance. The gap is not "no design system" but three execution problems: (1) ~350+ screen-level `koolaColors` static references bypass `useTheme()`, so dark mode is broken almost everywhere except `SettingsScreen`; (2) surfaces are flat with no depth/motion tokens and dated affordances; (3) production discovery surfaces lack real imagery.

This change is a **component-level redesign ("Scope B")** of the production surfaces that folds the dark-mode correctness fix into the same pass. It deliberately does NOT swap the styling backbone (Unistyles/Restyle deferred) because the proven `useTheme()` pattern already solves dark mode at zero new-dependency risk, and the app carries Fabric "scar tissue" (crashes tied to view-tree churn) that makes a backbone swap high-risk without a separate spike.

Constraints inherited from prior hard-won fixes (must hold): no `BlurView` (faux-blur SVG stays); `gifted-chat` internals, `FlatList` perf tuning, and `freezeOnBlur` untouched; media pipeline untouched; brand mark stays flat.

## Goals / Non-Goals

**Goals:**
- Make the app look "2026": layered depth, tasteful motion, gradient Moments ring, modern chat/auth affordances, real imagery on Connect.
- Fix dark mode correctly on every in-scope production screen using the `SettingsScreen` reference pattern, touching each screen once.
- Add the missing token layers (motion, shadow scale, zIndex, opacity, extra spacing/radius, display type) **additively**, without rescaling existing token values.
- Keep changes incremental and revert-safe; introduce a design-lint ratchet so kỷ luật survives long-term.
- Update `ui-dna.md` to match the new reality.

**Non-Goals:**
- No styling-backbone swap (Unistyles/Restyle) — deferred to a separate future spike.
- No redesign of Services/Shopping mockups (dead wireframes) until they become real features.
- No new heavy UI dependency; haptic + Inter font are gated optional, not assumed.
- No changes to backend, Socket.IO contracts, `gifted-chat` internals, `FlatList` tuning, `freezeOnBlur`, media pipeline, or navigation route contracts.
- No UX flow / navigation rewrite (that would be "Scope C").

## Decisions

### Decision 1: Evolve via `useTheme()`, do NOT adopt a styling backbone now
Convert screen-level static colors to `useTheme().palette` per the `SettingsScreen` pattern: `const { palette } = useTheme(); const styles = useMemo(() => makeStyles(palette), [palette]);` and pass `palette` to sub-components that need color.
- **Why over Unistyles/Restyle**: the 11 primitives already use `useTheme()` correctly; the broken part is screen code, which this pattern fixes with zero new dependencies and zero Fabric risk. A backbone swap would force rewriting the primitives (which carry Fabric fixes) and introduce a Babel-plugin coexistence risk with Reanimated — worth a dedicated spike later, not blocking the redesign.
- **Trade-off**: `useTheme()` causes a context re-render on theme switch. For a chat app where users set theme ~once, this is negligible.

### Decision 2: Additive-only token evolution (never rescale existing values)
Add `motion` tokens (durations fast≈120 / normal≈180 / slow≈260–300; easing; spring configs), a shadow scale (`xs/sm/md/lg/xl`) plus a dark-mode shadow variant, and additive `zIndex`, `opacity`, `spacing` (+40/+48), `radius` (+`xs2`:4 / +`xl`:24), and a `display` typography variant.
- **Why**: existing `koolaRadii.md=14` is referenced 79×, `koolaColors.*` 457×, and only 5 typography variants are actually used. Rescaling `14→12` or renaming `heading→headline` would churn hundreds of call sites and visually shift every card/button — a regression disguised as "tokenization". Adding new tokens is safe; migrating call sites to them is opt-in per screen.
- **Alternative rejected**: the 8-file split proposed earlier — deferred; a barrel `index.ts` re-export can make it cheap later, but file-splitting alone adds churn without value now.

### Decision 3: Dark-mode shadows elevate via surface, not black
On dark backgrounds a black drop shadow is nearly invisible, so depth must come from a lighter elevated surface (and optionally a subtle light hairline), not `shadowColor:#000`. The shadow scale therefore resolves per-palette.

### Decision 4: Reconciled spring/motion rule (updates `ui-dna.md`)
`ui-dna.md` currently says "under 200ms" and "no spring/bounce", but the code already (correctly) uses `withSpring` for image zoom/pan and (incorrectly) for decorative tab-dock bounce, and has 3 perpetual `withRepeat(-1)` loops gated dead behind `DIAG_STATIC_TABDOCK=true`. New rule: **spring allowed only for direct-manipulation gestures (zoom/pan/drag); decorative spring/bounce on chrome stays banned; no perpetual reanimated loops; durations may extend to ≈300ms for navigation/modal transitions, keep micro-interactions <200ms.** The dead gated loops stay dead.

### Decision 5: Chat bubble depth lives inside gifted-chat callbacks
Bubble depth, message grouping/tail, and the read-tick visual are implemented via `renderBubble`/`renderCustomView` callbacks only. The library, its `FlatList`, `removeClippedSubviews:false`, batching props, and `freezeOnBlur` are not touched. Read-tick reuses existing `useReadReceipts` data — no new message-transport state is invented.

### Decision 6: Moments gradient ring via react-native-svg
Replace the flat orange `MomentRing` border with an SVG gradient stroke using the already-installed `react-native-svg` (`Defs`+`LinearGradient`), mirroring the faux-blur technique. No `react-native-linear-gradient` dependency. Viewed/unviewed states map to gradient vs muted stroke.

### Decision 7: Variant-aware `maxFontSizeMultiplier`
Font scaling caps are variant-aware, never a global `1.0` (which would break accessibility): content variants (`body`) scale generously (≈1.5) or uncapped; chrome variants (`caption`, `label`) cap ≈1.3 to protect tight layouts. Per-instance override allowed. Layout is tested at 1.3× as an a11y gate; the real fix for overflow is flexible layout, cap is only a backstop.

### Decision 8: Governance ratchet (warn → error per directory)
Add a design-lint rule blocking magic-number spacing/radius and raw hex literals. Start at `warn` globally; flip to `error` per directory as each cluster is migrated and cleaned, so the codebase is never a wall of red. `src/ui` goes to `error` first.

### Decision 9: Batch ordering by risk (foundation → lowest-risk screens → chat last)
Token foundation first (no UI change). Then Personal (SettingsScreen is the proven template, lowest risk). Then Auth, Connect, Moments. Chat chrome last because it borders the Fabric-sensitive areas. Each batch declares scope/non-scope/risk/files/verification and pauses for review.

## Risks / Trade-offs

- **[Dark-mode conversion misses an intentional static]** → Exclusion list is explicit (brand logo colors, media/viewer dark overlays, faux-blur SVG gradient stops); reviewer checks each converted file against it.
- **[Chat bubble redesign perturbs gifted-chat scroll/Fabric]** → Confine to `renderBubble` callbacks; do not alter `listViewProps`/tuning; device smoke test for pop-back and scroll before marking the chat batch done.
- **[Depth/shadow tuning looks heavy or inconsistent across light/dark]** → Shadow scale is a small fixed set resolved per-palette; review light+dark side by side per batch.
- **[maxFontSizeMultiplier harms a11y if set too tight]** → Never `1.0`; content generous; 1.3× layout gate.
- **[Scope creep from "make it 2026"]** → Scope B only (component visuals, no flow/navigation rewrite); Services/Shopping and backbone swap explicitly out; each batch reviewed before the next.
- **[Device-only verification can't be automated]** → `tsc`+`jest` per batch are the automated gate; device smoke tests (chat pop-back, Moments media lifecycle, dark-mode visual pass) are flagged as manual and cannot be auto-verified.
- **[Overlap with existing `uiux-modernization-roadmap`]** → This change complements it (deeper component redesign); it reuses the same incremental/revert governance rather than duplicating it, and updates the shared `ui-dna.md` once.

## Migration Plan

1. Land token foundation additively (no screen renders change) — verify `tsc`+`jest`.
2. Migrate clusters in risk order (Personal → Auth → Connect → Moments → Chat), each as an independent revert-safe batch, converting dark mode + applying redesign in the same touch.
3. Flip design-lint to `error` per directory as each cluster is cleaned.
4. Update `ui-dna.md` alongside the foundation + as rules are reconciled.
5. Rollback: because batches are scoped per cluster and additive at the token layer, a regressing batch can be reverted without touching other clusters or the token foundation.

## Open Questions

- Haptic feedback (`react-native-haptic-feedback`) and Inter font: adopt now (needs dependency-gate approval) or defer? Treated as gated-optional until approved.
- Whether to later split `theme.ts` into a `theme/` folder with a barrel export — deferred, not required by this change.
