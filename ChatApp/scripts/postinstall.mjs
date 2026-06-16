#!/usr/bin/env node
/**
 * postinstall.mjs
 *
 * Runs after `npm install` in ChatApp/.
 * Creates dev-config.json from example if it doesn't exist yet.
 * Does NOT run IP detection (may fail offline/VPN) — just provides safe defaults.
 */
import { existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const local = resolve(ROOT, 'dev-config.json');
const example = resolve(ROOT, 'dev-config.example.json');

if (!existsSync(local) && existsSync(example)) {
  copyFileSync(example, local);
  console.log('\n✓ Created ChatApp/dev-config.json from example (default emulator IP).');
  console.log('  → To use a physical device, run `npm run dev:sync-host` from repo root.\n');
} else if (existsSync(local)) {
  // Already exists — no-op
} else {
  console.warn('\n⚠ dev-config.example.json not found. Skipping postinstall config copy.\n');
}
