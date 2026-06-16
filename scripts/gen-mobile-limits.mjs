#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(REPO, 'chat-backend/src/media/media-limits.constants.ts');
const DST = resolve(REPO, 'ChatApp/src/services/media/__generated__/media-limits.ts');

const src = readFileSync(SRC, 'utf8');
const re = /export const (MAX_[A-Z_]+_BYTES) = ([^;]+);/g;
const lines = [];
lines.push('// AUTO-GENERATED — DO NOT EDIT');
lines.push('// Source: chat-backend/src/media/media-limits.constants.ts');
lines.push('// Regenerate: `npm run gen:limits` from repo root.');
lines.push('// Editing this file will be overwritten and your changes lost.');
lines.push('');
lines.push('/* eslint-disable */');
let count = 0;
for (const [, name, expr] of src.matchAll(re)) {
  lines.push(`export const ${name.replace('_BYTES', '_SIZE')} = ${expr.trim()};`);
  count++;
}
if (count === 0) {
  console.error('No constants matched in source file');
  process.exit(1);
}
mkdirSync(dirname(DST), { recursive: true });
writeFileSync(DST, lines.join('\n') + '\n');
console.log(`Generated ${count} constant(s) -> ${DST.replace(REPO, '')}`);
