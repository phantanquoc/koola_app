import { Platform } from 'react-native';
import { asyncStorage } from './storage/asyncStorage';
// JS package version. NOTE: this is the npm package version, which is NOT the
// same value as the native `versionName` in android/app/build.gradle. Reading
// the native build version requires a native module (react-native-device-info
// or a react-native-config key), which would mean a new dependency + rebuild.
// The backend only stores this string as session metadata, so the JS version is
// an honest, dependency-free source. See the report note on version drift.
import { version as packageVersion } from '../../package.json';

const DEVICE_ID_KEY = 'deviceId';

/**
 * Resolved device id, cached for the process lifetime.
 *
 * NOTE: `clearAll()` on logout only removes the keys in asyncStorage's KEYS
 * map, and `deviceId` is deliberately NOT one of them — the device identity has
 * to outlive any single session, otherwise every logout would look like a new
 * device to the backend's 1-device-per-member enforcement.
 */
let cachedDeviceId: string | null = null;

/**
 * In-flight resolution promise.
 *
 * apiService calls getDeviceId() from the request interceptor, so app startup
 * fires many concurrent calls before the first one has written to storage.
 * Caching only the resolved value is not enough: every concurrent caller would
 * miss the cache, generate its own UUID, and the last write would win — so
 * requests in the same batch could carry DIFFERENT device ids, and the backend
 * would read them as competing devices and force-logout the member. Memoizing
 * the promise collapses all concurrent callers onto one generate+persist.
 */
let inFlight: Promise<string> | null = null;

/**
 * Generate a stable device ID (UUID v4) on first launch.
 * Persists in AsyncStorage under key "deviceId".
 *
 * CRITICAL: Never regenerates after first creation — this ID backs device
 * session enforcement on the backend (1 business member = 1 active device).
 * Regeneration would force-logout the member's previous session.
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }
  if (inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    const stored = await asyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      cachedDeviceId = stored;
      return stored;
    }

    const newDeviceId = generateUUID();
    await asyncStorage.setItem(DEVICE_ID_KEY, newDeviceId);
    cachedDeviceId = newDeviceId;
    return newDeviceId;
  })();

  try {
    return await inFlight;
  } finally {
    // Release the memo either way: on success the value lives in
    // cachedDeviceId, on failure the next caller should be free to retry.
    inFlight = null;
  }
}

export interface DeviceMetadata {
  deviceId: string;
  deviceModel: string;
  osVersion: string;
  appVersion: string;
  platform: string;
}

/**
 * Device metadata for business session tracking.
 * Sent to the backend on account switch (business accounts only) and shown in
 * the admin-facing active-sessions list.
 *
 * Derived from `Platform.constants` so no native dependency is required.
 * Android exposes a real device model; iOS does not expose one through
 * Platform, so we fall back to the interface idiom (iPhone/iPad) — coarse but
 * accurate, never fabricated.
 */
export async function getDeviceMetadata(): Promise<DeviceMetadata> {
  const deviceId = await getDeviceId();
  return {
    deviceId,
    deviceModel: resolveDeviceModel(),
    osVersion: resolveOsVersion(),
    appVersion: packageVersion,
    platform: Platform.OS,
  };
}

/**
 * Session metadata as the exact HTTP headers the backend reads.
 *
 * `POST /accounts/switch` reads x-device-id / x-device-model / x-os-version /
 * x-app-version (see AccountsController.switchAccount). Keep these names in
 * sync with that handler.
 */
export async function getDeviceHeaders(): Promise<Record<string, string>> {
  const meta = await getDeviceMetadata();
  return {
    'X-Device-ID': meta.deviceId,
    'X-Device-Model': meta.deviceModel,
    'X-OS-Version': meta.osVersion,
    'X-App-Version': meta.appVersion,
  };
}

function resolveDeviceModel(): string {
  if (Platform.OS === 'android') {
    const c = Platform.constants as { Model?: string; Manufacturer?: string };
    const model = c.Model?.trim();
    const maker = c.Manufacturer?.trim();
    if (model && maker && !model.toLowerCase().startsWith(maker.toLowerCase())) {
      return `${maker} ${model}`;
    }
    return model || 'Android device';
  }
  if (Platform.OS === 'ios') {
    const c = Platform.constants as { interfaceIdiom?: string };
    const idiom = c.interfaceIdiom?.toLowerCase();
    if (idiom === 'pad') return 'iPad';
    if (idiom === 'phone') return 'iPhone';
    return 'iOS device';
  }
  return Platform.OS;
}

function resolveOsVersion(): string {
  if (Platform.OS === 'android') {
    const c = Platform.constants as { Release?: string; Version?: number };
    const release = c.Release?.trim();
    const api = c.Version;
    if (release && api) return `Android ${release} (API ${api})`;
    if (release) return `Android ${release}`;
    return `Android ${String(Platform.Version)}`;
  }
  if (Platform.OS === 'ios') {
    const c = Platform.constants as { osVersion?: string };
    return `iOS ${c.osVersion?.trim() || String(Platform.Version)}`;
  }
  return String(Platform.Version);
}

/**
 * Generate UUID v4. Prefers the crypto-safe source when the runtime exposes
 * one, falling back to Math.random — same pattern as newIdempotencyKey() in
 * ShoppingCheckoutScreen.
 */
function generateUUID(): string {
  try {
    const c: unknown = globalThis.crypto;
    if (c && typeof (c as { randomUUID?: unknown }).randomUUID === 'function') {
      return (c as { randomUUID(): string }).randomUUID();
    }
  } catch {
    // fall through to the Math.random template below
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Reset the in-process caches (tests only).
 * Does NOT delete from AsyncStorage — use
 * `asyncStorage.removeItem('deviceId')` for a full reset.
 */
export function _clearCachedDeviceId(): void {
  cachedDeviceId = null;
  inFlight = null;
}
