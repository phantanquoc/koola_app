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
  canvas: '#F7F9FC',
  surface: '#FFFFFF',
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
 * level1: pure white (standard content surface)
 * level2: slightly warmer white (elevated card)
 * overlay: dark scrim base
 *
 * WCAG AA check:
 *   ink (#101828) on level0 (#F2F4F7) = 14.5:1 ✓
 *   ink (#101828) on level1 (#FFFFFF) = 17.4:1 ✓
 *   ink (#101828) on level2 (#FAFBFC) = 16.6:1 ✓
 */
export const koolaLightSurfaces: SurfaceScale = {
  level0: '#F2F4F7',
  level1: '#FFFFFF',
  level2: '#FAFBFC',
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