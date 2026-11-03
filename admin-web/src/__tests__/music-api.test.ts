import { describe, it, expect } from 'vitest';
import { buildMusicCsv, durationLabel, licenseLabel, type MusicTrack } from '../musicApi';

function track(over: Partial<MusicTrack> = {}): MusicTrack {
  return {
    _id: 'id1',
    title: 'Rainy Afternoon',
    artist: 'Purrple Cat',
    durationMs: 214_000,
    audioKey: 'music-catalog/a.mp3',
    previewKey: 'music-catalog/a.mp3',
    licenseType: 'cc-by',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    sourceUrl: 'https://freemusicarchive.org/x',
    attribution: 'Purrple Cat',
    addedBy: 'admin1',
    addedAt: '2026-11-02T10:00:00.000Z',
    isActive: false,
    usageCount: 3,
    tags: [],
    ...over,
  };
}

describe('durationLabel', () => {
  it('formats m:ss', () => {
    expect(durationLabel(214_000)).toBe('3:34');
    expect(durationLabel(60_000)).toBe('1:00');
    expect(durationLabel(5_000)).toBe('0:05');
  });

  it('renders a dash for unusable values', () => {
    expect(durationLabel(0)).toBe('—');
    expect(durationLabel(Number.NaN)).toBe('—');
    expect(durationLabel(-1)).toBe('—');
  });
});

describe('licenseLabel', () => {
  it('translates known enums', () => {
    expect(licenseLabel('owned-by-koola')).toBe('Nội bộ Koola');
  });

  it('passes an unknown value through instead of hiding it', () => {
    expect(licenseLabel('cc-by-sa')).toBe('cc-by-sa');
  });
});

describe('buildMusicCsv', () => {
  it('starts with a BOM so Excel reads Vietnamese', () => {
    expect(buildMusicCsv([track()]).charCodeAt(0)).toBe(0xfeff);
  });

  it('includes inactive tracks', () => {
    const csv = buildMusicCsv([track({ isActive: false })]);
    expect(csv).toContain('Không');
  });

  it('quotes cells containing commas or quotes', () => {
    const csv = buildMusicCsv([track({ title: 'Hello, "World"' })]);
    expect(csv).toContain('"Hello, ""World"""');
  });

  it('keeps license and source URLs for clearance records', () => {
    const csv = buildMusicCsv([track()]);
    expect(csv).toContain('https://creativecommons.org/licenses/by/4.0/');
    expect(csv).toContain('https://freemusicarchive.org/x');
  });

  it('never contains a presigned signature', () => {
    expect(buildMusicCsv([track()])).not.toContain('X-Amz-Signature');
  });
});
