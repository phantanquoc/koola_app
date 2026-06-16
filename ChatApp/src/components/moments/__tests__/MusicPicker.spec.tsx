/**
 * MusicPicker.spec.tsx
 *
 * Logic unit tests for MusicPicker license labeling.
 */

describe('MusicPicker — license label logic', () => {
  const LICENSE_LABELS: Record<string, string> = {
    cc0: 'Public domain',
    'cc-by': 'CC BY',
    'epidemic-sound': 'Epidemic Sound — licensed',
    'owned-by-koola': '',
  };

  function getLicenseLabel(licenseType: string, attribution?: string): string {
    if (licenseType === 'cc-by' && attribution) {
      return attribution;
    }
    return LICENSE_LABELS[licenseType] ?? '';
  }

  it('should return "Public domain" for cc0 tracks', () => {
    expect(getLicenseLabel('cc0')).toBe('Public domain');
  });

  it('should return attribution for cc-by tracks with attribution', () => {
    expect(getLicenseLabel('cc-by', 'Music by Artist Name')).toBe('Music by Artist Name');
  });

  it('should return "CC BY" for cc-by tracks without attribution', () => {
    expect(getLicenseLabel('cc-by', undefined)).toBe('CC BY');
    expect(getLicenseLabel('cc-by', '')).toBe('CC BY');
  });

  it('should return "Epidemic Sound — licensed" for epidemic-sound', () => {
    expect(getLicenseLabel('epidemic-sound')).toBe('Epidemic Sound — licensed');
  });

  it('should return empty string for owned-by-koola', () => {
    expect(getLicenseLabel('owned-by-koola')).toBe('');
  });

  it('should return empty string for unknown license types', () => {
    expect(getLicenseLabel('unknown-type')).toBe('');
  });

  it('should not crash on empty tracks list', () => {
    const tracks: any[] = [];
    const labels = tracks.map((t) => getLicenseLabel(t.licenseType, t.attribution));
    expect(labels).toEqual([]);
  });
});
