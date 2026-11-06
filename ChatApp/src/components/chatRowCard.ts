import { koolaCardElevations, koolaGlowShadows, koolaRadii } from '../ui';

/**
 * Detached-card recipe for Chat Home list rows (Messages + Contacts).
 *
 * Parity with the Personal tab: light uses `koolaCardElevations.B` — the
 * shipped default of the Personal card language (white fill, #101828 shadow at
 * 0.05, offset 0/4, radius 12, elevation 3, 0.5px #E4E7EC hairline) — and dark
 * uses `koolaGlowShadows.dark.card`, where a black shadow is invisible so
 * elevation is carried by a lighter surface tint plus a colored rim.
 *
 * Why the constant instead of `subscribeCardElevation()`: that store exists so
 * LogoLab can A/B the Personal tab's elevation. Subscribing per row would mint
 * one external-store subscription per mounted list cell (hundreds on a long
 * conversation list) for a DEV-only switch, so rows read the shipped preset
 * directly. If the preset changes, `koolaCardElevations.B` changes with it.
 *
 * The 8px gutter (all four sides, via 4px vertical margins per card) is what
 * buys the shadow room to read: at the previous 2px inter-card gap the 12px
 * blur of the next card painted straight over it.
 */
export const CHAT_ROW_CARD_GAP = 8;

export type ChatRowCardStyle = ReturnType<typeof makeChatRowCardStyle>;

export function makeChatRowCardStyle(scheme: 'light' | 'dark') {
  return {
    ...(scheme === 'dark' ? koolaGlowShadows.dark.card : koolaCardElevations.B),
    borderRadius: koolaRadii.md,
    marginHorizontal: CHAT_ROW_CARD_GAP,
    // Half per side → adjacent cards sit CHAT_ROW_CARD_GAP apart.
    marginVertical: CHAT_ROW_CARD_GAP / 2,
  };
}
