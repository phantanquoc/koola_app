export const koolaColors = {
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
} as const;

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
