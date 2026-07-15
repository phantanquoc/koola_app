## Context

`ChatApp/src/ui/KoolaText.tsx` defines per-variant `maxFontSizeMultiplier` caps in the `VARIANT_MAX_FONT_SCALE` map (6 variants: display, title, heading, body, label, caption). These prevent the OS font multiplier from exceeding the cap regardless of user accessibility settings. WCAG 2.1 AA recommends 200% text scaling. Raising the cap requires verifying that no screen clips, overlaps, or loses reachability at the higher multiplier.

Current state (pre-change):
- display: 1.5, title: 1.35, heading: 1.35, body: 1.5, label: 1.3, caption: 1.3
- 443 usages, 76 importing files, 0 per-instance overrides — entire app flows through 1 map.
- KoolaBadge.tsx and KoolaChip.tsx use variant="caption" with numberOfLines={1}.

## Goals

- Reach 2.0x multiplier support for content text without breaking any production workflow.
- Keep chrome text (label/caption) at a safe 1.6 cap to protect hard single-line layouts.
- Document screens that require layout changes to accommodate the higher scale.

## Non-Goals

- Changing the font token scale (sizes remain as-is; the multiplier cap changes).
- Adding an in-app font-size picker.
- Fixing screens that are broken at the CURRENT cap (that's change #5's responsibility).

## Decisions

### Tiered content/chrome cap raise

Content variants (display, title, heading, body) raise to 2.0. Chrome variants (label, caption) raise to 1.6.

**Rationale:** KoolaBadge and KoolaChip enforce `numberOfLines={1}` on caption/label text. Raising chrome caps to 2.0 would cause content truncation (loss-of-content), which violates WCAG 1.4.4 more severely than a moderate cap. Content variants wrap freely and can safely scale to the full 200% WCAG target. Chrome cap 2.0 is a device-gated decision — only finalize after auditing clip on physical device at Track 3.

### Primitive-level overflow protection

`KoolaText` does NOT set `numberOfLines` by default (React Native wraps unlimited by default). This is already correct — no change needed. Containers with fixed height that constrain text (e.g. KoolaButton with `numberOfLines={1}`) use `minHeight` not fixed `height`, so they grow with text. This is already safe.

### Screen-by-screen audit (device-gated)

Each screen category (auth, chat, navigation, moments, connect, profile, settings, commerce, admin) SHALL be tested at 2.0x on a physical Android device. Any clipping/overlap documented and fixed. This is Track 3 work — blocked until device testing.

### Verification at scale boundaries

Tests SHALL verify layout at 1.0x (baseline), 1.5x (previous cap), and 2.0x (new cap). Overflow/clipping failures at 2.0x SHALL fail the verification gate.

## Verification Strategy

- Component tests verify correct `maxFontSizeMultiplier` values per variant tier.
- Set Android emulator/device font scale to 2.0x and screenshot every primary screen (device-gated).
- No screen SHALL have clipped primary actions, overlapping labels, or unreachable interactive content at 2.0x.
- tsc/lint/jest clean after changes.
