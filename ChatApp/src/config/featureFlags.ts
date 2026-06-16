/**
 * featureFlags.ts
 *
 * Runtime feature flags for APP_KOOLA.
 *
 * LOCAL_FIRST_SQLITE — gates the SQLite-backed read path.
 *   When true:
 *     - useMessages reads from messageRepository + subscription
 *     - ConversationListScreen reads from conversationRepository + subscription
 *     - useMessageSync writes into messageRepository.upsertMany
 *     - syncOrchestrator and socketEventRouter are active
 *     - MMKV backfill runs on first launch
 *   When false (default):
 *     - Legacy MMKV + REST path is used (unchanged behaviour)
 *
 * To enable during development, set in ChatApp/.env before bundling:
 *   LOCAL_FIRST_SQLITE=true
 *
 * The flag is read once at module load time and is immutable at runtime.
 * This avoids conditional hook calls that would violate the Rules of Hooks.
 */

import Config from 'react-native-config';

// React Native's Metro bundler replaces process.env.* at bundle time.
// In Jest, the mock setup can set process.env.LOCAL_FIRST_SQLITE = 'true'.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const process: any;

// In dev mode, read from dev-config.json (Metro-resolved, no native rebuild needed).
// In prod, read from react-native-config (.env baked into native build).
let _devConfigFlag = false;
if (__DEV__) {
  try {
    const dev = require('@dev-config') as { LOCAL_FIRST_SQLITE?: boolean };
    _devConfigFlag = dev.LOCAL_FIRST_SQLITE === true;
  } catch {}
}

export const LOCAL_FIRST_SQLITE =
  _devConfigFlag ||
  Config.LOCAL_FIRST_SQLITE === 'true' ||
  (typeof process !== 'undefined' && process.env.LOCAL_FIRST_SQLITE === 'true');

/**
 * Returns true when the local-first SQLite read path is enabled.
 * Stable across the lifetime of the JS bundle — safe to use in hooks.
 */
export function isLocalFirstEnabled(): boolean {
  return LOCAL_FIRST_SQLITE;
}

/**
 * Hook wrapper — returns the flag value.
 * Provided as a hook so components can follow the hook naming convention
 * and the flag can be overridden in tests via module mocking.
 */
export function useLocalFirstFlag(): boolean {
  return LOCAL_FIRST_SQLITE;
}
