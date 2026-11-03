/**
 * Runnable check for `src/admin/music/audio-metadata.ts` — the one module jest
 * cannot exercise, because `music-metadata@11` is ESM-only and jest's CJS
 * transform refuses to load it (`Must use import to load ES Module`).
 *
 * Usage (after `npm run build`):
 *   node dist/../scripts/check-audio-metadata.js     # or run via ts-node
 *   docker run --rm -v "$PWD":/w -w /w node:20-alpine node scripts/check-audio-metadata.js
 *
 * Exits non-zero if the wrapper stops returning milliseconds or stops rejecting
 * unparseable input.
 */
const assert = require('node:assert/strict');
const path = require('node:path');

const distPath = path.resolve(__dirname, '../dist/admin/music/audio-metadata.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readDurationMs } = require(distPath);

/** Build a minimal 16-bit PCM WAV of `seconds` length. */
function makeWav(seconds) {
  const sampleRate = 8000;
  const channels = 1;
  const bitsPerSample = 16;
  const dataBytes = sampleRate * seconds * channels * (bitsPerSample / 8);
  const buf = Buffer.alloc(44 + dataBytes);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buf.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  return buf;
}

(async () => {
  const threeSeconds = await readDurationMs(makeWav(3), 'audio/wav');
  assert.equal(threeSeconds, 3000, `expected 3000 ms, got ${threeSeconds}`);

  const halfSecond = await readDurationMs(makeWav(0.5), 'audio/wav');
  assert.equal(halfSecond, 500, `expected 500 ms, got ${halfSecond}`);

  // Empty / garbage input must reject, so an admin cannot create a "silent"
  // track from a non-audio upload.
  let rejected = false;
  try {
    await readDurationMs(Buffer.alloc(0), 'audio/mpeg');
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, 'empty buffer should be rejected');

  let garbageRejected = false;
  try {
    await readDurationMs(Buffer.from('not audio at all'), 'audio/mpeg');
  } catch {
    garbageRejected = true;
  }
  assert.equal(garbageRejected, true, 'garbage buffer should be rejected');

  console.log('OK — audio-metadata wrapper returns milliseconds and rejects bad input');
})().catch((err) => {
  console.error('FAILED —', err.message);
  process.exit(1);
});
