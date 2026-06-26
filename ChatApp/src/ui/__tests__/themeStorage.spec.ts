/**
 * Unit tests for getThemeMode / setThemeMode in asyncStorage.
 * Tests the persistence layer, read-failure fallback, and normalization.
 */

// We need to mock AsyncStorage BEFORE importing asyncStorage, because the
// module under test imports AsyncStorage at module scope.
const mockStore = new Map<string, string>();
const mockGetItem = jest.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null));
const mockSetItem = jest.fn((key: string, value: string) => {
  mockStore.set(key, value);
  return Promise.resolve();
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (...args: unknown[]) => mockGetItem(...(args as [string])),
    setItem: (...args: unknown[]) => mockSetItem(...(args as [string, string])),
    removeItem: jest.fn(),
    multiRemove: jest.fn(),
  },
}));

import { asyncStorage } from '../../services/storage/asyncStorage';

describe('asyncStorage theme accessors', () => {
  beforeEach(() => {
    mockStore.clear();
    mockGetItem.mockClear();
    mockSetItem.mockClear();
    // Reset to default implementations
    mockGetItem.mockImplementation((key: string) => Promise.resolve(mockStore.get(key) ?? null));
    mockSetItem.mockImplementation((key: string, value: string) => {
      mockStore.set(key, value);
      return Promise.resolve();
    });
  });

  describe('getThemeMode', () => {
    it('returns "system" when no value is stored (null)', async () => {
      const result = await asyncStorage.getThemeMode();
      expect(result).toBe('system');
    });

    it('returns "light" when "light" is stored', async () => {
      mockStore.set('theme', 'light');
      const result = await asyncStorage.getThemeMode();
      expect(result).toBe('light');
    });

    it('returns "dark" when "dark" is stored', async () => {
      mockStore.set('theme', 'dark');
      const result = await asyncStorage.getThemeMode();
      expect(result).toBe('dark');
    });

    it('returns "system" when "system" is stored', async () => {
      mockStore.set('theme', 'system');
      const result = await asyncStorage.getThemeMode();
      expect(result).toBe('system');
    });

    it('returns "system" for an invalid stored value', async () => {
      mockStore.set('theme', 'invalid-value');
      const result = await asyncStorage.getThemeMode();
      expect(result).toBe('system');
    });

    it('returns "system" and logs warning on read failure', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockGetItem.mockRejectedValueOnce(new Error('disk error'));
      const result = await asyncStorage.getThemeMode();
      expect(result).toBe('system');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('getThemeMode read failed'),
        expect.any(Error),
      );
      warnSpy.mockRestore();
    });
  });

  describe('setThemeMode', () => {
    it('persists the mode to AsyncStorage', async () => {
      await asyncStorage.setThemeMode('dark');
      expect(mockSetItem).toHaveBeenCalledWith('theme', 'dark');
      expect(mockStore.get('theme')).toBe('dark');
    });
  });

  describe('round-trip', () => {
    it('persists and retrieves the mode correctly', async () => {
      await asyncStorage.setThemeMode('dark');
      const result = await asyncStorage.getThemeMode();
      expect(result).toBe('dark');
    });
  });
});
