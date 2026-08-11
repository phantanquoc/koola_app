/**
 * useMessages.ts
 *
 * Thin re-export of the SQLite-backed message hook.
 *
 * HISTORY: this file used to hold two complete implementations — a legacy
 * MMKV + REST path and an early-return delegation to `useMessagesFromDb` gated
 * on the `LOCAL_FIRST_SQLITE` flag. The flag has been `true` in every config
 * that ships (`dev-config.json`, `.env`, `.env.perf`), so the ~550 lines below
 * the early return were unreachable in every build — including the `perf`
 * variant used for measurements. They were removed rather than left to rot,
 * because dead code that *looks* live is worse than no code: its
 * `[PERF useMessages]` logs implied a code path that never ran, and any bug
 * fixed in `useMessagesFromDb` had to be mentally diffed against a twin
 * nobody executed.
 *
 * IMPORTANT — the flag no longer gates the message read path. `LOCAL_FIRST_SQLITE`
 * still gates socket wiring (`wireSocketEvents` in AuthContext), the MMKV
 * backfill (`dbInit`), the sync orchestrator, and ConversationListScreen's read
 * path. Turning it OFF now leaves chat reading SQLite with no socket events
 * feeding it — realtime breaks instead of falling back. If a real fallback is
 * ever needed again, restore it from git history (`useMessages.ts` before this
 * commit) rather than reconstructing it.
 *
 * The indirection is kept so `ChatScreen` and future consumers keep importing a
 * capability name (`useMessages`) instead of a storage-implementation name.
 */

export { useMessagesFromDb as useMessages } from './useMessagesFromDb';
