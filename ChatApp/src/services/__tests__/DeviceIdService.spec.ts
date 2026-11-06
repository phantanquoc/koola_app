/**
 * DeviceIdService — device identity invariants.
 *
 * The device id backs the backend's 1-active-device-per-business-member rule,
 * so the two properties that matter are: it never regenerates once stored, and
 * concurrent callers all observe the SAME id (apiService's request interceptor
 * calls getDeviceId() on every request, so startup fires many at once).
 */
import { asyncStorage } from '../storage/asyncStorage';
import {
  getDeviceId,
  getDeviceHeaders,
  getDeviceMetadata,
  _clearCachedDeviceId,
} from '../DeviceIdService';

jest.mock('../storage/asyncStorage', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    asyncStorage: {
      getItem: jest.fn(async (k: string) => store.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
      removeItem: jest.fn(async (k: string) => {
        store.delete(k);
      }),
    },
  };
});

const store = (jest.requireMock('../storage/asyncStorage') as { __store: Map<string, string> })
  .__store;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

beforeEach(() => {
  store.clear();
  _clearCachedDeviceId();
  jest.clearAllMocks();
});

describe('getDeviceId', () => {
  it('generates a v4 UUID on first launch and persists it under "deviceId"', async () => {
    const id = await getDeviceId();

    expect(id).toMatch(UUID_RE);
    expect(store.get('deviceId')).toBe(id);
  });

  it('reads the stored id back and never regenerates it', async () => {
    store.set('deviceId', 'pre-existing-device-id');

    expect(await getDeviceId()).toBe('pre-existing-device-id');

    // Even after the in-process cache is dropped (fresh app launch), the
    // persisted value wins — regenerating would force-logout the member.
    _clearCachedDeviceId();
    expect(await getDeviceId()).toBe('pre-existing-device-id');
    expect(asyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('survives a simulated app restart (same id across cache resets)', async () => {
    const first = await getDeviceId();
    _clearCachedDeviceId();
    const second = await getDeviceId();

    expect(second).toBe(first);
  });

  it('returns one id to concurrent callers and writes storage once', async () => {
    // Regression guard: caching only the resolved value let every concurrent
    // caller generate its own UUID, so requests in one batch could carry
    // different device ids and the backend would read competing devices.
    const ids = await Promise.all(Array.from({ length: 25 }, () => getDeviceId()));

    expect(new Set(ids).size).toBe(1);
    expect(asyncStorage.setItem).toHaveBeenCalledTimes(1);
  });

  it('caches after resolution — no repeat storage reads', async () => {
    await getDeviceId();
    const readsAfterFirst = (asyncStorage.getItem as jest.Mock).mock.calls.length;
    await getDeviceId();

    expect((asyncStorage.getItem as jest.Mock).mock.calls.length).toBe(readsAfterFirst);
  });
});

describe('getDeviceHeaders', () => {
  it('emits exactly the header names POST /accounts/switch reads', async () => {
    const headers = await getDeviceHeaders();

    expect(Object.keys(headers).sort()).toEqual([
      'X-App-Version',
      'X-Device-ID',
      'X-Device-Model',
      'X-OS-Version',
    ]);
    expect(headers['X-Device-ID']).toBe(await getDeviceId());
    // Metadata must be non-empty strings — the backend stores them verbatim
    // and admins read them in the active-sessions list.
    for (const value of Object.values(headers)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe('getDeviceMetadata', () => {
  it('reports platform and a resolved model/os without a native dependency', async () => {
    const meta = await getDeviceMetadata();

    expect(meta.deviceId).toMatch(UUID_RE);
    expect(meta.platform).toBe('ios'); // RN preset's default Platform.OS
    expect(meta.deviceModel.length).toBeGreaterThan(0);
    expect(meta.osVersion.length).toBeGreaterThan(0);
    expect(meta.appVersion).toMatch(/^\d+\.\d+/);
  });
});
