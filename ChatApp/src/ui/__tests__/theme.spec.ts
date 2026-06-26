import { resolveMode, normalizeMode } from '../theme';

describe('normalizeMode', () => {
  it('returns "light" for stored "light"', () => {
    expect(normalizeMode('light')).toBe('light');
  });

  it('returns "dark" for stored "dark"', () => {
    expect(normalizeMode('dark')).toBe('dark');
  });

  it('returns "system" for stored "system"', () => {
    expect(normalizeMode('system')).toBe('system');
  });

  it('returns "system" for null', () => {
    expect(normalizeMode(null)).toBe('system');
  });

  it('returns "system" for undefined', () => {
    expect(normalizeMode(undefined)).toBe('system');
  });

  it('returns "system" for empty string', () => {
    expect(normalizeMode('')).toBe('system');
  });

  it('returns "system" for invalid value', () => {
    expect(normalizeMode('midnight')).toBe('system');
  });

  it('returns "system" for numeric string', () => {
    expect(normalizeMode('123')).toBe('system');
  });
});

describe('resolveMode', () => {
  it('returns "light" when mode is "light" regardless of OS', () => {
    expect(resolveMode('light', 'dark')).toBe('light');
    expect(resolveMode('light', 'light')).toBe('light');
    expect(resolveMode('light', null)).toBe('light');
  });

  it('returns "dark" when mode is "dark" regardless of OS', () => {
    expect(resolveMode('dark', 'light')).toBe('dark');
    expect(resolveMode('dark', 'dark')).toBe('dark');
    expect(resolveMode('dark', null)).toBe('dark');
  });

  it('follows OS when mode is "system"', () => {
    expect(resolveMode('system', 'dark')).toBe('dark');
    expect(resolveMode('system', 'light')).toBe('light');
  });

  it('defaults to "light" when mode is "system" and OS is null/undefined', () => {
    expect(resolveMode('system', null)).toBe('light');
    expect(resolveMode('system', undefined)).toBe('light');
  });
});
