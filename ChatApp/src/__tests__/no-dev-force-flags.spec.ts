import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';

/**
 * Guard: no DEV_FORCE_* flags hardcoded to true in source.
 *
 * Primary gate — catches accidental commits of debug flags.
 * Pattern: DEV_FORCE_ANYTHING = true (with optional whitespace).
 */

function walkSync(dir: string, exts: Set<string>): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === '__generated__' || entry.name === 'node_modules') continue;
      results.push(...walkSync(full, exts));
    } else if (exts.has(extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

describe('no DEV_FORCE_* hardcoded literals', () => {
  const srcRoot = resolve(__dirname, '../');
  const files = walkSync(srcRoot, new Set(['.ts', '.tsx']));
  const relFiles = files.map((f) => relative(srcRoot, f));

  if (relFiles.length === 0) {
    it('found source files to scan', () => {
      expect(relFiles.length).toBeGreaterThan(0);
    });
    return;
  }

  it.each(relFiles)('%s does not contain DEV_FORCE_X = true', (relFile) => {
    const src = readFileSync(resolve(srcRoot, relFile), 'utf8');
    expect(src).not.toMatch(/DEV_FORCE_[A-Z_]+\s*=\s*true/);
  });
});
