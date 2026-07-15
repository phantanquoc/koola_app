## Why

`KoolaText` (the shared text primitive at `ChatApp/src/ui/KoolaText.tsx`) hard-caps `maxFontSizeMultiplier` per variant via the `VARIANT_MAX_FONT_SCALE` map. The current caps (1.3–1.5) prevent users who configure large system font sizes from reaching WCAG 2.1 AA's recommended 200% text scaling. This change raises content variant caps to 2.0 and chrome variant caps to 1.6, with overflow protection to prevent clipping at the higher scale.

## What Changes

- Raise `KoolaText` `maxFontSizeMultiplier` caps: content variants (display, title, heading, body) to 2.0; chrome variants (label, caption) to 1.6.
- Chrome variants capped lower because `KoolaBadge` and `KoolaChip` enforce `numberOfLines={1}` — raising to 2.0 would clip content (loss-of-content worse than moderate cap per WCAG 1.4.4).
- Audit and verify every screen where raising the cap causes clipping, overlap, or unreachable content (device-gated, Track 3).
- Verify that no primary workflow becomes unusable at the new caps.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `mobile-theme-system`: Raises the existing `maxFontSizeMultiplier` cap — content variants from 1.3–1.5 to 2.0, chrome variants from 1.3 to 1.6 — and documents overflow protection rules for the text primitive.

## Impact

- `ChatApp/src/ui/KoolaText.tsx` — cap values change in `VARIANT_MAX_FONT_SCALE` map (6 variants).
- 443 usages across 76 importing files — all flow through this single map.
- 0 per-instance `maxFontSizeMultiplier` overrides in the codebase — pure map change.
- High blast radius: raising the cap affects every `KoolaText` consumer app-wide.
- No backend, API, database, or real-time contract changes.
- No token rescale (existing font size tokens remain the same; only the OS multiplier cap changes).

## Non-Goals

- Not part of the auth accessibility change (#5 handles current-cap verification).
- No redesign of the token scale or font-size definitions.
- No introduction of a user-controlled in-app font size selector.
- No changes to `KoolaTextInput` placeholder scaling (may require separate consideration).
