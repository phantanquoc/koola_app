#!/usr/bin/env node
/**
 * check-prod-bundle.mjs
 *
 * Builds a production JS bundle and scans for forbidden strings that should
 * never leak into a release build (dev IPs, placeholder values, debug flags).
 *
 * Usage: npm run check:bundle (from ChatApp/)
 *
 * Requires: react-native CLI available (npx react-native bundle).
 */
import { execSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const FORBIDDEN = [
  '192.168.',
  'PLACEHOLDER',
  'dev-config.json',
  '"DEV_HOST"',
  'DEV_FORCE_LOCAL_FIRST',
  '10.0.2.2',
];

const out = mkdtempSync(join(tmpdir(), 'koola-bundle-'));
const bundlePath = join(out, 'main.jsbundle');

console.log('Building production bundle...');
try {
  execSync(
    `npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output "${bundlePath}"`,
    { stdio: 'pipe', cwd: process.cwd() },
  );
} catch (err) {
  console.error('Bundle build failed:', err.stderr?.toString() || err.message);
  rmSync(out, { recursive: true, force: true });
  process.exit(1);
}

console.log('Scanning bundle for forbidden strings...');
const bundle = readFileSync(bundlePath, 'utf8');
let leaked = false;

for (const needle of FORBIDDEN) {
  if (bundle.includes(needle)) {
    console.error(`❌ Prod bundle contains forbidden string: "${needle}"`);
    leaked = true;
  }
}

rmSync(out, { recursive: true, force: true });

if (leaked) {
  console.error('\n❌ Prod bundle leaked dev-only values. Fix before release.');
  process.exit(1);
} else {
  console.log('✓ Prod bundle clean — no forbidden strings found.');
}
