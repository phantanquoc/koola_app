import type { Palette, SurfaceScale } from '../theme';

// ─── SemanticTokens type (locked v1 — Token Contract Matrix) ────────────────

export type SemanticTokens = {
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

/**
 * Build semantic tokens from palette + surface scale.
 *
 * Content-first hue rule enforced:
 * - bg.* / surface.* / text.* (except text.onAction) are NEUTRAL (no brand hue)
 * - action.* / signal.* / status.* / focus.* / link / brand.* carry brand hue
 *
 * Pure function — deterministic given the same inputs.
 */
export function makeSemanticTokens(
  palette: Palette,
  surfaces: SurfaceScale,
): SemanticTokens {
  return {
    bg: {
      canvas: palette.canvas,
    },
    surface: {
      level0: surfaces.level0,
      level1: surfaces.level1,
      level2: surfaces.level2,
      overlay: surfaces.overlay,
    },
    text: {
      primary: palette.ink,
      muted: palette.muted,
      faint: palette.faint,
      onAction: palette.surface, // white/light text on primary-fill buttons
    },
    action: {
      primary: palette.primary,
      primaryPressed: palette.primaryDark,
      primarySoft: palette.primarySoft,
    },
    signal: {
      selected: palette.primary,
      unread: palette.accent,
    },
    status: {
      success: palette.success,
      warning: palette.warning,
      danger: palette.danger,
    },
    border: {
      subtle: palette.line,
      strong: palette.muted,
    },
    focus: {
      ring: palette.primary,
    },
    link: palette.primary,
    brand: {
      red: palette.brandRed,
      blue: palette.brandBlue,
      green: palette.brandGreen,
    },
  };
}
