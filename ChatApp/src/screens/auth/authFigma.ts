// Shared Figma-exact LAYOUT values (sizes, radii, gaps) from LoginScreen
// (node 2:4). Color values deliberately live here no more: auth screens consume
// `useTheme().tokens.semantic` like every other surface, so the palette cannot
// drift from the rest of the app. See openspec/ui-dna.md.
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

