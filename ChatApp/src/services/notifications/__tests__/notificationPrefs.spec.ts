/**
 * Unit tests for notificationPrefs — the local-only (mock) notification
 * detail preferences cache. Mirrors the mocking style used in
 * ui/__tests__/themeStorage.spec.ts: mock @react-native-async-storage before
 * importing anything that transitively imports it at module scope.
 */

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

const NOTIF_PREFS_KEY = 'notification_prefs';

// hydrateNotificationPrefs is idempotent via a module-level `hydrated` flag,
// so each test needs a fresh module instance to test hydration in isolation.
function freshModule() {
  jest.resetModules();
  return require('../notificationPrefs') as typeof import('../notificationPrefs');
}

describe('notificationPrefs', () => {
  beforeEach(() => {
    mockStore.clear();
    mockGetItem.mockClear();
    mockSetItem.mockClear();
    mockGetItem.mockImplementation((key: string) => Promise.resolve(mockStore.get(key) ?? null));
    mockSetItem.mockImplementation((key: string, value: string) => {
      mockStore.set(key, value);
      return Promise.resolve();
    });
  });

  it('defaults all 6 keys to true before hydration', () => {
    const mod = freshModule();
    expect(mod.getNotificationPrefs()).toEqual({
      directMessages: true,
      groupMessages: true,
      momentsMentions: true,
      shopping: true,
      connect: true,
      services: true,
    });
  });

  it('hydrate reads persisted values and merges over defaults', async () => {
    mockStore.set(NOTIF_PREFS_KEY, JSON.stringify({ shopping: false, connect: false }));
    const mod = freshModule();
    await mod.hydrateNotificationPrefs();
    expect(mod.getNotificationPrefs()).toEqual({
      directMessages: true,
      groupMessages: true,
      momentsMentions: true,
      shopping: false,
      connect: false,
      services: true,
    });
  });

  it('hydrate is idempotent — a second call does not re-read storage', async () => {
    mockStore.set(NOTIF_PREFS_KEY, JSON.stringify({ services: false }));
    const mod = freshModule();
    await mod.hydrateNotificationPrefs();
    expect(mockGetItem).toHaveBeenCalledTimes(1);

    // Change storage behind the module's back — idempotent hydrate must not
    // pick this up because `hydrated` is already true.
    mockStore.set(NOTIF_PREFS_KEY, JSON.stringify({ services: true, shopping: false }));
    await mod.hydrateNotificationPrefs();
    expect(mockGetItem).toHaveBeenCalledTimes(1);
    expect(mod.getNotificationPrefs().services).toBe(false);
  });

  it('update persists the merged object and notifies subscribers', async () => {
    const mod = freshModule();
    const listener = jest.fn();
    const unsubscribe = mod.subscribeNotificationPrefs(listener);

    await mod.updateNotificationPrefs({ groupMessages: false });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(mod.getNotificationPrefs().groupMessages).toBe(false);
    expect(mod.getNotificationPrefs().directMessages).toBe(true);

    const persisted = JSON.parse(mockStore.get(NOTIF_PREFS_KEY) ?? '{}');
    expect(persisted).toEqual({
      directMessages: true,
      groupMessages: false,
      momentsMentions: true,
      shopping: true,
      connect: true,
      services: true,
    });

    unsubscribe();
  });

  it('falls back to defaults without throwing on corrupt stored JSON', async () => {
    mockStore.set(NOTIF_PREFS_KEY, '{not valid json');
    const mod = freshModule();
    await expect(mod.hydrateNotificationPrefs()).resolves.toBeUndefined();
    expect(mod.getNotificationPrefs()).toEqual({
      directMessages: true,
      groupMessages: true,
      momentsMentions: true,
      shopping: true,
      connect: true,
      services: true,
    });
  });

  it('falls back to defaults without throwing when storage read rejects', async () => {
    mockGetItem.mockRejectedValueOnce(new Error('disk error'));
    const mod = freshModule();
    await expect(mod.hydrateNotificationPrefs()).resolves.toBeUndefined();
    expect(mod.getNotificationPrefs()).toEqual({
      directMessages: true,
      groupMessages: true,
      momentsMentions: true,
      shopping: true,
      connect: true,
      services: true,
    });
  });

  it('falls back to defaults without throwing when no value is stored', async () => {
    const mod = freshModule();
    await mod.hydrateNotificationPrefs();
    expect(mockStore.has(NOTIF_PREFS_KEY)).toBe(false);
    expect(mod.getNotificationPrefs()).toEqual({
      directMessages: true,
      groupMessages: true,
      momentsMentions: true,
      shopping: true,
      connect: true,
      services: true,
    });
  });
});
