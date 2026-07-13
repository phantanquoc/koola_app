import type { SemanticTokens } from './semantic';

// ─── GlassSurface shape (locked) ────────────────────────────────────────────
// Faux-glass chrome layer — no BlurView. Values are resolved colors/alphas,
// composed from semantic tokens.

export type GlassSurface = {
  /** Base translucent fill */
  fill: string;
  /** Brand/cool cast over the fill */
  tint: string;
  /** Top specular highlight color (fades to transparent) */
  sheen: string;
  /** 1px inner top edge */
  hairline: string;
  /** Cool-tone bottom hairline */
  bottomLine: string;
};

// ─── ComponentTokens type (locked v1) ───────────────────────────────────────

export type ComponentTokens = {
  chatBubble: {
    own: { bg: string; text: string };
    other: { bg: string; text: string };
  };
  tab: { active: string; inactive: string; dock: GlassSurface };
  composer: { surface: GlassSurface };
  sheet: { surface: GlassSurface };
};

/**
 * Build component tokens from semantic tokens.
 *
 * Rules:
 * - Color/surface fields compose from semantic COLOR tokens only (no raw hex)
 * - Layout/motion fields MAY reference primitive spacing/radius/typography/motion
 * - Content-surface tokens (chatBubble, list rows) use NO glass/translucent treatment
 * - Only chrome tokens (tab.dock, composer.surface, sheet.surface) use GlassSurface
 *
 * Pure function — deterministic given the same inputs.
 */
export function makeComponentTokens(semantic: SemanticTokens): ComponentTokens {
  return {
    chatBubble: {
      own: {
        bg: semantic.action.primarySoft,
        text: semantic.text.primary,
      },
      other: {
        bg: semantic.surface.level1,
        text: semantic.text.primary,
      },
    },
    tab: {
      active: semantic.action.primary,
      inactive: semantic.text.muted,
      dock: {
        fill: semantic.surface.level1,
        tint: semantic.action.primarySoft,
        sheen: semantic.surface.level2,
        hairline: semantic.border.subtle,
        bottomLine: semantic.border.subtle,
      },
    },
    composer: {
      surface: {
        fill: semantic.surface.level1,
        tint: semantic.action.primarySoft,
        sheen: semantic.surface.level2,
        hairline: semantic.border.subtle,
        bottomLine: semantic.border.subtle,
      },
    },
    sheet: {
      surface: {
        fill: semantic.surface.level1,
        tint: semantic.action.primarySoft,
        sheen: semantic.surface.level2,
        hairline: semantic.border.subtle,
        bottomLine: semantic.border.subtle,
      },
    },
  };
}
