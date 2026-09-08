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

/** Blue-soft icon well (light scheme) — used across Wallet / Account / Security cards. */
export const PERSONAL_BLUE_WELL = {
  light: { bg: '#EAF2FF', border: '#CCE0FF' },
  dark: { bg: 'rgba(37,99,235,0.15)', border: 'rgba(37,99,235,0.3)' },
} as const;
