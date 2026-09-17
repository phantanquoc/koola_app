// ─── Palette type ────────────────────────────────────────────────────────────

export type Palette = {
  ink: string;
  muted: string;
  faint: string;
  line: string;
  canvas: string;
  surface: string;
  primary: string;
  primaryDark: string;
  primarySoft: string;
  accent: string;
  accentSoft: string;
  warm: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  warningInk: string;
  success: string;
  successSoft: string;
  skeleton: string;
  brandRed: string;
  brandBlue: string;
  brandGreen: string;
};

// ─── Light palette (unchanged export — back-compat) ──────────────────────────

export const koolaColors: Palette = {
  ink: '#101828',
  muted: '#667085',
  faint: '#98A2B3',
  line: '#E4E7EC',
  canvas: '#F3F3F3',
  surface: '#F5F7F9',
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primarySoft: '#DBEAFE',
  accent: '#10B981',
  accentSoft: '#D1FAE5',
  warm: '#F97316',
  danger: '#EF4444',
  dangerSoft: '#FEE2E2',
  warning: '#F59E0B',
  warningSoft: '#FEF3C7',
  warningInk: '#B45309',
  success: '#12B76A',
  successSoft: '#DCFCE7',
  skeleton: '#EEF2F7',
  brandRed: '#E12D24',
  brandBlue: '#1E50C8',
  brandGreen: '#1FA64A',
};

// ─── Dark palette ────────────────────────────────────────────────────────────
// WCAG 2.1 AA validated (normal text >=4.5:1):
//   ink (#F2F4F7) on canvas (#0F1419) = 15.4:1
//   ink (#F2F4F7) on surface (#1C2026) = 13.2:1
//   muted (#A0AAB8) on surface (#1C2026) = 5.6:1
//   primary (#4D8DF7) on surface (#1C2026) = 5.04:1
//   primary (#4D8DF7) on canvas (#0F1419) = 5.70:1
//   NOTE: white (#FFF) on primary fill = 3.25:1 — passes AA large-text (>=3:1)
//   but not AA normal-text. Button labels (14px semi-bold) are borderline; if
//   exact AA normal-text is required on primary-fill buttons, use ink on
//   primarySoft instead. This is an inherent tension for mid-luminance blues.

export const koolaDarkColors: Palette = {
  ink: '#F2F4F7',
  muted: '#A0AAB8',
  faint: '#6C7686',
  line: '#2F3542',
  canvas: '#0F1419',
  surface: '#1C2026',
  primary: '#4D8DF7',
  primaryDark: '#2563EB',
  primarySoft: '#1E2A44',
  accent: '#34D399',
  accentSoft: '#10362B',
  warm: '#FB923C',
  danger: '#F87171',
  dangerSoft: '#3B1D1D',
  warning: '#FBBF24',
  warningSoft: '#3A2E12',
  warningInk: '#FCD34D',
  success: '#3DD68C',
  successSoft: '#10362B',
  skeleton: '#252B33',
  brandRed: '#F04438',
  brandBlue: '#5B8DEF',
  brandGreen: '#34D399',
};

// ─── Theme mode types + resolution ──────────────────────────────────────────

export type ThemeMode = 'light' | 'dark' | 'system';

const VALID_MODES: readonly string[] = ['light', 'dark', 'system'];

/**
 * Normalize a stored/unknown value to a valid ThemeMode.
 * Any value not in {light, dark, system} (including null/undefined) returns 'system'.
 */
export function normalizeMode(stored: string | null | undefined): ThemeMode {
  if (stored && VALID_MODES.includes(stored)) {
    return stored as ThemeMode;
  }
  return 'system';
}

/**
 * Resolve the effective palette direction from the user's mode and the OS color scheme.
 * Pure function — unit-testable without React.
 */
export function resolveMode(
  mode: ThemeMode,
  systemScheme: 'light' | 'dark' | null | undefined,
): 'light' | 'dark' {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  // mode === 'system': follow OS, default to light if OS scheme unknown
  return systemScheme === 'dark' ? 'dark' : 'light';
}

export const koolaRadii = {
  xs: 8,
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
  // ─── Additive scale (2026) ────────────────────────────────────────────────
  xs2: 4,
  xl: 24,
} as const;

export const koolaSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  // ─── Additive steps (2026, 8px grid) ──────────────────────────────────────
  '40': 40,
  '48': 48,
} as const;

export const koolaTypography = {
  title: { fontSize: 24, lineHeight: 30, fontWeight: '800' as const },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
  // ─── Additive variant (2026) ──────────────────────────────────────────────
  display: { fontSize: 32, lineHeight: 40, fontWeight: '800' as const },
} as const;

export const koolaShadows = {
  soft: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 4,
  },
  subtle: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  // ─── Shadow scale (additive — xs through xl) ──────────────────────────────
  xs: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sm: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 5,
  },
  xl: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;

/**
 * Dark-mode shadow variant.
 * On dark backgrounds, black shadows are invisible. Elevation is expressed via
 * a lighter surface tint + a subtle light hairline (top border). Components
 * apply `koolaDarkShadows[level]` when `resolvedScheme === 'dark'`.
 *
 * Usage pattern (in a palette-aware style factory):
 *   const shadow = resolvedScheme === 'dark' ? koolaDarkShadows.md : koolaShadows.md;
 */
export const koolaDarkShadows = {
  xs: {
    backgroundColor: '#1F252B',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.04)',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    backgroundColor: '#222830',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.05)',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  md: {
    backgroundColor: '#262D36',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.06)',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  lg: {
    backgroundColor: '#2A323C',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.07)',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  xl: {
    backgroundColor: '#2F3844',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.08)',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
} as const;

// ─── Faux-glass dock gradient ───────────────────────────────────────────────

/**
 * Gradient stops for the faux-glass chrome docks (bottom tab dock + chat
 * composer). Both surfaces read the same stops so the two cannot drift apart
 * on color — the drift risk that a shared component would otherwise solve.
 *
 * This is the primitive layer, so raw hex is allowed here (same as
 * `koolaColors`). It is deliberately NOT a `GlassSurface` component token:
 * that contract is five single colors, while a gradient needs an ordered
 * top/mid/bottom triple with per-stop opacity.
 *
 * Usage:
 *   const stops = koolaGlassGradient[resolvedScheme];
 */
export const koolaGlassGradient = {
  light: {
    top: { color: '#FFFFFF', opacity: 0.78 },
    mid: { color: '#EEF4FF', opacity: 0.7 },
    bottom: { color: '#DBEAFE', opacity: 0.62 },
  },
  dark: {
    top: { color: '#1C2026', opacity: 0.85 },
    mid: { color: '#1E2A44', opacity: 0.75 },
    bottom: { color: '#1A2332', opacity: 0.7 },
  },
} as const;

/** Specular sheen color for the glass docks, per scheme. */
export const koolaGlassSheen = {
  light: '#FFFFFF',
  dark: '#2A323C',
} as const;

// ─── zIndex tokens ──────────────────────────────────────────────────────────

export const koolaZIndex = {
  /** Below default — hidden or background layers */
  hide: -1,
  /** Default stacking */
  base: 0,
  /** Dropdowns, popovers, floating action buttons */
  dropdown: 10,
  /** Sticky headers, tab bars */
  sticky: 20,
  /** Overlays, scrims */
  overlay: 30,
  /** Modals, bottom sheets */
  modal: 40,
  /** Toasts, snackbars — always on top */
  toast: 50,
} as const;

// ─── Opacity tokens ─────────────────────────────────────────────────────────

export const koolaOpacity = {
  /** Disabled controls */
  disabled: 0.4,
  /** Active press feedback */
  pressed: 0.7,
} as const;

// ─── Surface scale (additive — v2 token foundation) ─────────────────────────
// Provides distinct, contrast-ordered elevation surfaces for the semantic layer.
// level0 is the deepest recessed surface; level1/level2 are progressively raised.
// overlay is the scrim/backdrop base.
// These do NOT modify the Palette type — they are a separate primitive.

export type SurfaceScale = {
  level0: string;
  level1: string;
  level2: string;
  overlay: string;
};

/**
 * Light surface scale.
 * level0: slightly recessed (cool grey tint off pure-white canvas)
 * level1: near-white (standard content surface — softened from pure white to reduce glare)
 * level2: pure white (elevated card)
 * overlay: dark scrim base
 *
 * WCAG AA check:
 *   ink (#101828) on level0 (#F2F4F7) = 14.5:1 ✓
 *   ink (#101828) on level1 (#F5F7F9) = 16.2:1 ✓
 *   ink (#101828) on level2 (#F9FAFB) = 17.2:1 ✓
 */
export const koolaLightSurfaces: SurfaceScale = {
  level0: '#F2F4F7',
  level1: '#F5F7F9',
  level2: '#F9FAFB',
  overlay: 'rgba(16, 24, 40, 0.6)',
};

/**
 * Dark surface scale.
 * level0: deepest dark (recessed/base)
 * level1: slightly elevated (standard content)
 * level2: noticeably lighter (raised card)
 * overlay: light scrim for dark mode
 *
 * WCAG AA check:
 *   ink (#F2F4F7) on level0 (#0F1419) = 15.4:1 ✓
 *   ink (#F2F4F7) on level1 (#1C2026) = 13.2:1 ✓
 *   ink (#F2F4F7) on level2 (#252B33) = 10.7:1 ✓
 */
export const koolaDarkSurfaces: SurfaceScale = {
  level0: '#0F1419',
  level1: '#1C2026',
  level2: '#252B33',
  overlay: 'rgba(0, 0, 0, 0.7)',
};

// ─── Light field + glow primitives (additive — Personal home & dock glow) ────
// Primitive layer, so raw hex is intentional here (same rule as `koolaColors`).
// Every primitive ships BOTH a light and a dark variant; consumers select with
// `resolvedScheme` and never hard-code hex in screen or component code.

/**
 * One radial bloom in the static light field.
 * `cx`/`cy`/`r` are relative (percentage) values that react-native-svg resolves
 * against the painted rect's bounding box, so blooms scale with any container.
 */
export type LightFieldBloom = {
  color: string;
  opacity: number;
  cx: string;
  cy: string;
  r: string;
};

export type LightField = {
  /** Canvas color painted under the blooms. */
  base: string;
  /** Blooms, ordered back to front. */
  blooms: readonly LightFieldBloom[];
};

/**
 * Static light-field background recipe (design D1). Screens render one
 * memoized `Svg` from these stops — the field never animates, so it is safe for
 * reduced-motion users and costs nothing per frame.
 *
 * Usage:
 *   const field = koolaLightField[resolvedScheme];
 */
export const koolaLightField: { light: LightField; dark: LightField } = {
  light: {
    base: '#F3F3F3',
    blooms: [
      { color: '#FFFFFF', opacity: 0.55, cx: '50%', cy: '0%', r: '60%' },
      { color: '#FFFFFF', opacity: 0.35, cx: '15%', cy: '45%', r: '50%' },
      { color: '#E8E8E8', opacity: 0.22, cx: '90%', cy: '80%', r: '45%' },
    ],
  },
  dark: {
    base: '#0F1419',
    blooms: [
      { color: '#1E2A44', opacity: 0.65, cx: '50%', cy: '0%', r: '60%' },
      { color: '#1A2332', opacity: 0.5, cx: '15%', cy: '45%', r: '50%' },
      { color: '#10362B', opacity: 0.22, cx: '90%', cy: '80%', r: '45%' },
    ],
  },
};

/**
 * A style fragment expressible as a shadow, a surface tint, or a hairline —
 * the union the glow recipes need, because dark elevation is carried by tint
 * instead of a black shadow (same reasoning as `koolaDarkShadows`).
 */
export type GlowShadowStyle = {
  backgroundColor?: string;
  borderWidth?: number;
  borderColor?: string;
  borderTopWidth?: number;
  borderTopColor?: string;
  shadowColor?: string;
  shadowOffset?: { width: number; height: number };
  shadowOpacity?: number;
  shadowRadius?: number;
  elevation?: number;
};

export type GlowShadows = {
  /** Floating content cards. */
  card: GlowShadowStyle;
  /** Notch-style screen header. */
  header: GlowShadowStyle;
  /** Focused bottom-dock tab glow. */
  tabFocus: GlowShadowStyle;
};

/**
 * Glow elevation recipes (design D2). Light uses colored soft shadows; dark
 * expresses elevation through a lighter surface tint + hairline, and keeps a
 * colored glow for the focused tab so the treatment stays visible on a dark
 * canvas instead of disappearing with a black shadow.
 *
 * Usage:
 *   style={[cardStyle, koolaGlowShadows[resolvedScheme].card]}
 */
export const koolaGlowShadows: { light: GlowShadows; dark: GlowShadows } = {
  light: {
    card: {
      // Back-compat default — PersonalCard now reads per-preset
      // koolaCardElevations[*] in light; this value stays equivalent to preset A.
      backgroundColor: '#FFFFFF',
      shadowColor: '#101828',
      shadowOpacity: 0.08,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 18,
      elevation: 6,
    },
    header: {
      shadowColor: '#2563EB',
      shadowOpacity: 0.08,
      shadowOffset: { width: 0, height: 6 },
      shadowRadius: 16,
      elevation: 2,
    },
    tabFocus: {
      shadowColor: '#2563EB',
      shadowOpacity: 0.35,
      shadowOffset: { width: 0, height: 0 },
      shadowRadius: 12,
      elevation: 0,
    },
  },
  dark: {
    card: {
      backgroundColor: '#262D36',
      borderTopWidth: 0.5,
      borderTopColor: 'rgba(255,255,255,0.06)',
      borderColor: 'rgba(77,141,247,0.18)',
      borderWidth: 1,
    },
    header: {
      backgroundColor: '#222830',
      borderTopWidth: 0.5,
      borderTopColor: 'rgba(255,255,255,0.05)',
    },
    tabFocus: {
      shadowColor: '#4D8DF7',
      shadowOpacity: 0.28,
      shadowOffset: { width: 0, height: 0 },
      shadowRadius: 12,
      elevation: 0,
    },
  },
};

/**
 * Card elevation test presets (light scheme) — DEV-comparable variants for
 * how Personal-tab cards lift off the bloom-lit `#F3F3F3` canvas. Selected
 * via the store in `screens/dev/cardElevation.ts`; dark scheme keeps the
 * tinted-surface recipe in `koolaGlowShadows.dark`.
 *
 *  A: pure white + neutral soft shadow (iOS) with matching Android elevation
 *  B: pure white + hairline border + very light shadow (Apple-style, subtle)
 *  C: pure white, no shadow/border — separation by luminance only
 */
export type CardElevationId = 'A' | 'B' | 'C';

export const koolaCardElevations: Record<CardElevationId, GlowShadowStyle> = {
  A: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#101828',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 6,
  },
  B: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#101828',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 0.5,
    borderColor: '#E4E7EC',
  },
  C: {
    backgroundColor: '#FFFFFF',
  },
};

/**
 * Circular icon-well background (design D3). Wells carry icon glyphs only —
 * glyph color always comes from semantic text/action tokens, never from here,
 * so text contrast stays a semantic-token concern.
 */
export const koolaIconWell: { light: string; dark: string } = {
  light: '#EDF1FA',
  dark: '#232B36',
};

/** One gradient stop of the focused-tab glow ring. */
export type FocusGlowStop = { color: string; opacity: number };

/**
 * Focused-tab glow ring gradient stops (design D7) — red → orange → blue, the
 * brand triad, ordered start→end along the ring. Shared by the dock and any
 * future chrome so the ring recipe cannot drift per surface.
 *
 * Usage:
 *   const stops = koolaFocusGlow[resolvedScheme];
 */
export const koolaFocusGlow: {
  light: readonly FocusGlowStop[];
  dark: readonly FocusGlowStop[];
} = {
  light: [
    { color: '#F04438', opacity: 0.9 },
    { color: '#F97316', opacity: 0.9 },
    { color: '#2563EB', opacity: 0.9 },
  ],
  dark: [
    { color: '#F04438', opacity: 0.8 },
    { color: '#FB923C', opacity: 0.8 },
    { color: '#4D8DF7', opacity: 0.8 },
  ],
};