/**
 * The ONLY module in the backend that imports `music-metadata`.
 *
 * Why a wrapper: `music-metadata@11` is ESM-only and the backend compiles to
 * CommonJS. Node 20.19+ can `require()` ESM, so runtime is fine — but jest's
 * CJS transform cannot load it (`Must use import to load ES Module`), and a
 * dynamic `import()` inside jest fails without `--experimental-vm-modules`.
 * Confining the dependency here means every other spec can mock this module
 * and never resolve the package.
 *
 * Version matters: 7–10 carry high-severity advisories (an APEv2 allocation
 * bug, an unvalidated ID3v2 size, and an ASF/MP4 synchronous infinite loop
 * that cannot be caught). Do not downgrade.
 */

/**
 * Read a track's duration from its bytes, in milliseconds.
 *
 * Deliberately reads only duration. `common.title` / `common.artist` are NOT
 * surfaced: the admin types provenance by hand, and an ID3-guessed artist
 * would end up in the license export as though it had been verified.
 *
 * @throws when the buffer cannot be parsed or carries no duration — the caller
 *         turns that into a 400 so a non-audio upload never becomes a track.
 */
export async function readDurationMs(
  buffer: Buffer,
  mimeType: string,
): Promise<number> {
  const mm = await import('music-metadata');
  const meta = await mm.parseBuffer(buffer, { mimeType });
  const seconds = meta.format.duration;
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('Không đọc được thời lượng của file âm thanh');
  }
  return Math.round(seconds * 1000);
}
