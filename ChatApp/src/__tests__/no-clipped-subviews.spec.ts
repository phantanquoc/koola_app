import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';

/**
 * Guard: Android `removeClippedSubviews` crashes Fabric unmounts.
 *
 * RN 0.76 FlatList defaults `removeClippedSubviews` to TRUE on Android. When a
 * screen holding such a list unmounts (logout, back-nav, tab teardown) Fabric
 * crashes in ReactViewGroup.removeViewWithSubviewClippingEnabled →
 * "Cannot remove child at index N … childCount may be incorrect"
 * (facebook/react-native#53258).
 *
 * Two layers, both enforced here:
 *   1. patches/react-native+0.76.9.patch flips the FlatList default to false.
 *   2. every list in src/ states `removeClippedSubviews={false}` explicitly,
 *      so losing the patch (reinstall without postinstall) stays safe.
 */

function walkSync(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      results.push(...walkSync(full));
    } else if (extname(entry.name) === '.tsx') {
      results.push(full);
    }
  }
  return results;
}

// JSX element only: `<FlatList` followed by whitespace/`>`/`/`, not a generic
// type argument like `useRef<FlatList<IMessage>>`.
const LIST_OPEN = /(?<![\w.])<(?:Animated\.)?(?:FlatList|SectionList|VirtualizedList|BottomSheetFlatList|BottomSheetSectionList)(?=[\s>/])/g;

/** Text of the JSX opening tag starting at `start` (up to the matching `>`). */
function openingTag(src: string, start: number): string {
  let depth = 0;
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0 && src[i - 1] !== '=') return src.slice(start, i + 1);
  }
  return src.slice(start);
}

describe('removeClippedSubviews is disabled (Fabric removeViewAt crash)', () => {
  const appRoot = resolve(__dirname, '../..');
  const srcRoot = resolve(__dirname, '../');

  it('react-native FlatList default is patched to false', () => {
    const patch = readFileSync(resolve(appRoot, 'patches/react-native+0.76.9.patch'), 'utf8');
    expect(patch).toContain('return removeClippedSubviews ?? false;');
  });

  const files = walkSync(srcRoot);
  it.each(files.map((f) => relative(srcRoot, f)))('%s: every list sets removeClippedSubviews={false}', (rel) => {
    const src = readFileSync(resolve(srcRoot, rel), 'utf8');
    // Explicit opt-in (`={true}`, `: true`) is banned too.
    expect(src).not.toMatch(/removeClippedSubviews(?:=\{true\}|:\s*true)/);
    const missing: string[] = [];
    for (const m of src.matchAll(LIST_OPEN)) {
      const tag = openingTag(src, m.index ?? 0);
      if (!tag.includes('removeClippedSubviews={false}')) {
        missing.push(`line ${src.slice(0, m.index).split('\n').length}: ${m[0]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
