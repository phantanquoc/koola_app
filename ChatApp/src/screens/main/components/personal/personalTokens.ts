/**
 * Shared Personal-tab color constants that are Figma-spec but not yet in the
 * semantic token contract. Centralized here so the `#B91C1C` danger ink and
 * the blue-soft icon-well tint appear once, not repeated per-card with
 * individual eslint-disable comments.
 *
 * This is a token-definition file — raw hex is its purpose, mirroring
 * `theme.ts`. The lint rule targets style sheets, not token sources.
 */
/* eslint-disable no-restricted-syntax -- centralized Figma-spec color tokens, see ui-dna.md Figma-auth exception */

/** Figma 92:51 / 92:74 danger ink — deeper than `status.danger` for text on soft red fills. */
export const PERSONAL_DANGER_INK = '#B91C1C';

/** Soft red fill + border for warning rows (biometric prompt). */
export const PERSONAL_DANGER_SOFT = {
  light: { bg: '#FFF2F2', border: '#FDD2D2' },
  dark: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)' },
} as const;

/** Blue-soft icon well (light scheme) — used across Wallet / Account / Security cards. */
export const PERSONAL_BLUE_WELL = {
  light: { bg: '#EAF2FF', border: '#CCE0FF' },
  dark: { bg: 'rgba(37,99,235,0.15)', border: 'rgba(37,99,235,0.3)' },
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
