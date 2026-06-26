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
} as const;

export const koolaSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const koolaTypography = {
  title: { fontSize: 24, lineHeight: 30, fontWeight: '800' as const },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
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
} as const;
