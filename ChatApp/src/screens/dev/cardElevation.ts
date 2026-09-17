/**
 * Card-elevation DEV preset — mirrors the pattern used by `notchVariants`.
 *
 * Personal-tab cards on a bloom-lit canvas look different on Android (no
 * coloured shadow, only `elevation`) versus iOS, so we expose three presets
 * A/B/C via LogoLab and react to changes with a tiny external-store. In
 * non-DEV builds the getter always returns the shipped default so tree-shaking
 * can strip the switcher UI.
 */

import type { CardElevationId } from '../../ui/theme';

const DEFAULT: CardElevationId = 'B';

let current: CardElevationId = DEFAULT;
const listeners = new Set<() => void>();

export function getCardElevation(): CardElevationId {
  return current;
}

export function setCardElevation(id: CardElevationId): void {
  if (current === id) return;
  current = id;
  for (const cb of listeners) cb();
}

export function subscribeCardElevation(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
