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
 * To enable during development, set the env variable before bundling:
 *   LOCAL_FIRST_SQLITE=true npx react-native start
 *
 * The flag is read once at module load time and is immutable at runtime.
 * This avoids conditional hook calls that would violate the Rules of Hooks.
 */

// React Native's Metro bundler replaces process.env.* at bundle time.
// In Jest, the mock setup can set process.env.LOCAL_FIRST_SQLITE = 'true'.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const process: any;
const _flagValue: boolean =
  typeof process !== 'undefined' &&
  process.env.LOCAL_FIRST_SQLITE === 'true';

/**
 * Returns true when the local-first SQLite read path is enabled.
 * Stable across the lifetime of the JS bundle — safe to use in hooks.
 */
export function isLocalFirstEnabled(): boolean {
  return _flagValue;
}

/**
 * Hook wrapper — returns the flag value.
 * Provided as a hook so components can follow the hook naming convention
 * and the flag can be overridden in tests via module mocking.
 */
export function useLocalFirstFlag(): boolean {
  return _flagValue;
}
