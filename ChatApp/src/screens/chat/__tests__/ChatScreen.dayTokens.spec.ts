/**
 * ChatScreen.dayTokens.spec.ts — coverage for fix group 7.
 *
 * Fix group 7 corrected two `useCallback` dependency arrays in ChatScreen:
 * `renderSystemMessage` and `renderDay` both declared `[]` while referencing
 * themed styles, so each permanently captured the palette active at first
 * render. After a light↔dark switch, day separators and system messages kept
 * stale colors while the rest of the screen recolored.
 *
 * WHAT THIS FILE PROVES, AND WHAT IT DOES NOT
 * The defect itself is only observable by switching theme with a rendered
 * ChatScreen on screen, which this environment cannot do (no jsdom; navigation,
 * sqlite, socket, gifted-chat and bottom-sheet would all need mocking — the same
 * reason the sibling chat specs assert contracts rather than trees). This file
 * therefore does NOT prove the callbacks recreate on a theme change. It proves
 * the *necessary condition* underneath the fix, plus the structural fact that the
 * dependencies are declared — and it is explicit about which is which:
 *
 *   1. BEHAVIOURAL: the token values these two callbacks consume genuinely differ
 *      between the light and dark palettes. This is what makes the stale capture
 *      a visible bug rather than a theoretical one. Asserted against the real
 *      token factories, with the same palette pairings `ThemeProvider` uses.
 *
 *   2. STRUCTURAL: the two dependency arrays are no longer empty, and name the
 *      styles actually referenced in each body. A source assertion is the weaker
 *      instrument, used only where a render is unavailable — but it targets this
 *      defect exactly, since the failure mode is literally "the array goes back
 *      to `[]`".
 *
 * Neither half is sufficient alone: (1) without (2) would pass even with the bug
 * fully present, and (2) without (1) would pass on a palette where the bug had no
 * visible consequence. The on-device light↔dark check is task 6.3.
 */

import fs from 'fs';
import path from 'path';
import { makeSemanticTokens } from '../../../ui/tokens/semantic';
import {
  koolaColors,
  koolaDarkColors,
  koolaLightSurfaces,
  koolaDarkSurfaces,
} from '../../../ui/theme';

// Built with the same factory-and-palette pairings as `ThemeProvider` (see
// ThemeProvider.tsx: `resolved === 'dark' ? koolaDarkColors : koolaColors` and
// the matching surfaces), so these are the values the screen really receives —
// not a hand-rolled approximation of them.
const light = makeSemanticTokens(koolaColors, koolaLightSurfaces);
const dark = makeSemanticTokens(koolaDarkColors, koolaDarkSurfaces);

const CHAT_SCREEN = path.join(__dirname, '..', 'ChatScreen.tsx');
const source = fs.readFileSync(CHAT_SCREEN, 'utf8');

/**
 * Extracts the dependency array of the `useCallback` that follows `anchor`.
 *
 * Scoped by brace/bracket matching to a single callback rather than matched
 * across the whole ~980-line file: an unscoped regex for `[]` would hit dozens
 * of unrelated array literals and prove nothing about these two callbacks.
 */
function extractDependencyArray(anchor: string): string {
  const start = source.indexOf(anchor);
  expect(start).toBeGreaterThan(-1);

  const open = source.indexOf('(', source.indexOf('useCallback', start));
  expect(open).toBeGreaterThan(start);

  // Walk to the matching close paren of `useCallback(...)`, tracking nesting so
  // the arrow-function body's own parens/braces/brackets don't end the scan
  // early. The dependency array is the last bracketed group inside it.
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  expect(end).toBeGreaterThan(open);

  const call = source.slice(open, end);
  const arrayStart = call.lastIndexOf('[');
  const arrayEnd = call.lastIndexOf(']');
  expect(arrayStart).toBeGreaterThan(-1);
  expect(arrayEnd).toBeGreaterThan(arrayStart);

  return call.slice(arrayStart, arrayEnd + 1);
}

// ─── 1. The tokens differ between palettes (behavioural) ─────────────────────

describe('day-separator and system-message tokens differ between palettes', () => {
  it('system message text color differs', () => {
    // `styles.systemMessage` is `{ color: semantic.text.muted, fontSize: 12 }`.
    // If this held the same value in both palettes, a stale capture would be
    // invisible and the group-7 fix would be unobservable by any means.
    expect(light.text.muted).not.toBe(dark.text.muted);
  });

  it('day pill background and border colors differ', () => {
    // `styles.dayText` uses `semantic.bg.canvas` and `semantic.border.subtle`.
    // Both are asserted: the pill is the more visible of the two defects, since a
    // stale light canvas on a dark screen is a bright band.
    expect(light.bg.canvas).not.toBe(dark.bg.canvas);
    expect(light.border.subtle).not.toBe(dark.border.subtle);
  });

  it('the day pill background actually inverts rather than merely differing', () => {
    // Guards against the weaker reading of the assertion above, where two nearly
    // identical off-whites would satisfy `not.toBe` while the bug stayed
    // invisible. Light canvas is near-white and dark canvas is near-black, so the
    // stale-capture failure is a high-contrast error, not a subtle one.
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };

    expect(luminance(light.bg.canvas)).toBeGreaterThan(0.8);
    expect(luminance(dark.bg.canvas)).toBeLessThan(0.2);
  });
});

// ─── 2. The dependency arrays declare those styles (structural) ──────────────

describe('renderSystemMessage and renderDay declare their themed dependencies', () => {
  it('renderSystemMessage depends on the system-message style', () => {
    const deps = extractDependencyArray('const renderSystemMessage =');

    expect(deps).not.toBe('[]');
    expect(deps).toContain('styles.systemMessage');
  });

  it('renderDay depends on both day styles it references', () => {
    const deps = extractDependencyArray('const renderDay =');

    expect(deps).not.toBe('[]');
    expect(deps).toContain('styles.dayContainer');
    expect(deps).toContain('styles.dayText');
  });

  it('the extractor reads the intended callbacks, not just any array', () => {
    // Companion guard: without this, a broken extractor that returned some
    // unrelated dependency array elsewhere in the file could satisfy both tests
    // above. Anchoring on a callback whose dependencies are known and different
    // proves the extractor tracks its anchor.
    const renderMessage = extractDependencyArray('const renderMessage =');

    expect(renderMessage).toContain('currentUserId');
    expect(renderMessage).not.toContain('styles.systemMessage');
  });
});
