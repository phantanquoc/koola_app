/**
 * Shared Personal-tab color constants that are Figma-spec but not yet in the
 * semantic token contract. Centralized here so scheme-aware Figma-spec
 * tints appear once, not repeated per-card with individual
 * eslint-disable comments.
 *
 * NOTE (Phase1 token hygiene): the former PERSONAL_BLUE_WELL and
 * PERSONAL_DANGER_INK now resolve via semantic tokens
 * (`action.primarySoft`/`border.subtle` and `status.danger`) at the call
 * site — do not re-add raw-hex equivalents here.
 *
 * This is a token-definition file — raw hex is its purpose, mirroring
 * `theme.ts`. The lint rule targets style sheets, not token sources.
 */
/* eslint-disable no-restricted-syntax -- centralized Figma-spec color tokens, see ui-dna.md Figma-auth exception */

/** Soft red fill + border for warning rows (biometric prompt). */
export const PERSONAL_DANGER_SOFT = {
  light: { bg: '#FFF2F2', border: '#FDD2D2' },
  dark: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)' },
} as const;

/** Figma 92:19 star-gem colors — warm gold icon on soft yellow fill. */
export const PERSONAL_STAR = {
  light: { icon: '#A8871C', bg: '#FFFACC', border: 'rgba(196,154,26,0.35)' },
  dark: { icon: '#FBBF24', bg: 'rgba(255,245,204,0.15)', border: 'rgba(196,154,26,0.35)' },
} as const;

/** Upgrade banner gradient stops (Figma 92:19) — subtle indigo tint, not a semantic token. */
export const PERSONAL_UPGRADE_GRADIENT: Record<'light' | 'dark', [string, string]> = {
  light: ['#F8FAFF', '#EEF2FF'],
  dark: ['#1A2230', '#1E2C40'],
};
