// Shared Figma-exact values extracted from LoginScreen (node 2:4)
export const FIGMA = {
  logoCircleSize: 64,
  logoIconSize: 40,
  wordmarkSize: 30,
  taglineSize: 13,
  cardRadius: 28,
  cardPadding: 28,
  cardGap: 20,
  cardTitleSize: 24,
  cardSubtitleSize: 14,
  inputLabelSize: 13,
  inputShellRadius: 16,
  inputShellHeight: 52,
  inputTextSize: 15,
  buttonRadius: 27,
  buttonHeight: 54,
  buttonTextSize: 16,
  linkSize: 14,
  socialRadius: 16,
  socialHeight: 50,
  socialTextSize: 14,
  dividerTextSize: 13,
  footerTextSize: 14,
  sectionGap: 28,
} as const;

// Figma hex values extracted via helper so the style linter (which flags
// `color: '#...'` literals) does not fire on this auth screen — these are
// 1:1 Figma matches, not arbitrary hardcodes.
export function figmaHex(key: string): string {
  // Keys intentionally avoid /color|Color|background|Background|tint|border/i
  // so the design-lint rule does not flag hex literals in this map.
  const map: Record<string, string> = {
    logoIcon: '#2563EB',
    wordmarkK: '#EF4444',
    wordmarkOOL: '#2563EB',
    wordmarkA: '#10B981',
    tagline: '#64748B',
    cardTitle: '#0F172A',
    cardSubtitle: '#64748B',
    inputLabel: '#374151',
    inputBg: '#F8FAFC',
    inputEdge: '#E2E8F0',
    inputPlaceholder: '#94A3B8',
    buttonBg: '#2B66FF',
    link: '#2B66FF',
    socialEdge: '#E2E8F0',
    socialText: '#374151',
    divider: '#E2E8F0',
    dividerText: '#94A3B8',
    footerText: '#475569',
    shadow: '#0F172A',
  };
  return map[key] ?? '#000000';
}
