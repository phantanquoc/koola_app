#!/usr/bin/env node
/**
 * UI Design Audit Script
 *
 * Cross-platform Node script (PowerShell-safe, no reliance on unix grep/wc).
 * Scope: src/screens + src/components, excluding __tests__, dev/, and token-def files.
 *
 * Counts (by file):
 *   1. koolaColors imports
 *   2. Raw <Text> usage (not KoolaText)
 *   3. Touchable* usage
 *   4. Files containing hardcoded hex in style properties
 *   5. gap + flex:1-in-row findings (heuristic)
 *
 * Output: stable text + JSON (reusable by change #3 to diff progress).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const SCOPE_DIRS = [join(ROOT, 'src', 'screens'), join(ROOT, 'src', 'components')];

// ─── Helpers ────────────────────────────────────────────────────────────────

function shouldExclude(filePath) {
  const rel = relative(ROOT, filePath).replace(/\\/g, '/');
  if (rel.includes('__tests__')) return true;
  if (rel.includes('/dev/')) return true;
  if (rel.startsWith('src/screens/dev')) return true;
  // Token definition files are exempt
  if (rel.startsWith('src/ui/tokens/')) return true;
  if (rel === 'src/ui/theme.ts') return true;
  return false;
}

function collectFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (stat.isFile()) {
      const ext = extname(entry);
      if (ext === '.ts' || ext === '.tsx') {
        if (!shouldExclude(fullPath)) {
          results.push(fullPath);
        }
      }
    }
  }
  return results;
}

// ─── Detection patterns ─────────────────────────────────────────────────────

const RE_KOOLA_COLORS_IMPORT = /koolaColors/;
const RE_RAW_TEXT = /<Text[\s/>]/;
const RE_KOOLA_TEXT = /<KoolaText[\s/>]/;
const RE_TOUCHABLE = /<Touchable\w+/;
const RE_HEX_IN_STYLE = /#[0-9a-fA-F]{3,8}\b/;
const RE_GAP_STYLE = /gap\s*:/;
const RE_FLEX_ONE = /flex\s*:\s*1/;
const RE_FLEX_DIRECTION_ROW = /flexDirection\s*:\s*['"]row['"]/;

// ─── Main audit ─────────────────────────────────────────────────────────────

const files = [];
for (const dir of SCOPE_DIRS) {
  files.push(...collectFiles(dir));
}

const findings = {
  koolaColors: { count: 0, files: [] },
  rawText: { count: 0, files: [] },
  touchable: { count: 0, files: [] },
  hardcodedHex: { count: 0, files: [] },
  gapFlexRow: { count: 0, files: [] },
};

for (const filePath of files) {
  const content = readFileSync(filePath, 'utf8');
  const rel = relative(ROOT, filePath).replace(/\\/g, '/');

  // 1. koolaColors import
  if (RE_KOOLA_COLORS_IMPORT.test(content)) {
    findings.koolaColors.count++;
    findings.koolaColors.files.push(rel);
  }

  // 2. Raw <Text> (not KoolaText)
  // A file has raw <Text> if it uses <Text but not exclusively via KoolaText
  if (RE_RAW_TEXT.test(content)) {
    // Check if it imports Text from react-native (not just a re-export)
    const hasRnTextImport = /from\s+['"]react-native['"]/.test(content) ||
                            /from\s+['"]react-native-gifted-chat['"]/.test(content);
    const hasRawTextJsx = content.match(/<Text[\s/>]/g);
    if (hasRnTextImport && hasRawTextJsx) {
      findings.rawText.count++;
      findings.rawText.files.push(rel);
    }
  }

  // 3. Touchable* usage
  if (RE_TOUCHABLE.test(content)) {
    findings.touchable.count++;
    findings.touchable.files.push(rel);
  }

  // 4. Hardcoded hex in style properties
  if (RE_HEX_IN_STYLE.test(content)) {
    findings.hardcodedHex.count++;
    findings.hardcodedHex.files.push(rel);
  }

  // 5. gap + flex:1 in row (heuristic: file has flexDirection:'row' AND gap AND flex:1)
  if (RE_GAP_STYLE.test(content) && RE_FLEX_ONE.test(content) && RE_FLEX_DIRECTION_ROW.test(content)) {
    findings.gapFlexRow.count++;
    findings.gapFlexRow.files.push(rel);
  }
}

// ─── Output ─────────────────────────────────────────────────────────────────

const totalFiles = files.length;
console.log('=== UI Design Audit ===');
console.log(`Scope: src/screens + src/components (${totalFiles} files, excluding __tests__/dev/token-defs)\n`);
console.log(`koolaColors imports:   ${findings.koolaColors.count}`);
console.log(`Raw <Text> usage:      ${findings.rawText.count}`);
console.log(`Touchable* usage:      ${findings.touchable.count}`);
console.log(`Hardcoded hex:         ${findings.hardcodedHex.count}`);
console.log(`gap+flex:1 in row:     ${findings.gapFlexRow.count}`);
console.log('');

if (findings.gapFlexRow.count > 0) {
  console.log('--- gap+flex:1-in-row sites ---');
  for (const f of findings.gapFlexRow.files) {
    console.log(`  ${f}`);
  }
  console.log('');
}

// JSON output for programmatic consumption
const jsonOutput = {
  scope: 'src/screens + src/components',
  excludes: ['__tests__', 'dev/', 'token-defs'],
  totalFiles,
  counts: {
    koolaColors: findings.koolaColors.count,
    rawText: findings.rawText.count,
    touchable: findings.touchable.count,
    hardcodedHex: findings.hardcodedHex.count,
    gapFlexRow: findings.gapFlexRow.count,
  },
  details: {
    koolaColors: findings.koolaColors.files,
    rawText: findings.rawText.files,
    touchable: findings.touchable.files,
    hardcodedHex: findings.hardcodedHex.files,
    gapFlexRow: findings.gapFlexRow.files,
  },
};

console.log('--- JSON ---');
console.log(JSON.stringify(jsonOutput, null, 2));
