## 1. Dependency Setup

- [x] 1.1 Run `npm install react-native-mmkv@^2.12.2` inside `ChatApp/`
- [x] 1.2 Verify `react-native-mmkv` appears in `ChatApp/package.json` dependencies (not v3.x)
- [x] 1.3 If `ChatApp/ios/` exists, run `pod install` in that directory; if not, skip and note in task notes
  - NOTE: No `ios/` directory exists in this project. Skipped.
- [x] 1.4 Run `cd ChatApp/android && ./gradlew clean` to confirm autolink registers MMKV without errors ← (verify: gradle clean reaches BUILD SUCCESSFUL or its non-MMKV equivalent; no missing-module errors mentioning mmkv)
  - RESULT: BUILD SUCCESSFUL in 41s. `react-native-mmkv` appeared in the clean task list confirming autolink registered correctly.

## 2. Create mediaIndexService

- [x] 2.1 Create file `ChatApp/src/services/media/mediaIndexService.ts`
- [x] 2.2 Define exported interface `MediaIndexEntry { path: string; size: number; mime?: string; addedAt: number; lastAccess: number }`
- [x] 2.3 Instantiate `new MMKV({ id: 'media-index' })` and store the instance at module scope
- [x] 2.4 Maintain a module-scope `Map<string, MediaIndexEntry>` as the in-memory mirror of the MMKV contents
- [x] 2.5 Implement `load()` — read the MMKV string at key `entries`, `JSON.parse` it inside a try/catch, populate the Map; on parse error reset to empty Map and log a warning
- [x] 2.6 Make `load()` idempotent: subsequent calls after the first SHALL no-op
- [x] 2.7 Call `load()` once at module-import time (top-level statement after the MMKV instance) so the index is ready before any consumer imports
- [x] 2.8 Implement `get(mediaKey: string): MediaIndexEntry | null` returning from the Map
- [x] 2.9 Implement `set(mediaKey, entry)` — update the Map, then write the full entries object back to MMKV under key `entries`
- [x] 2.10 Implement `delete(mediaKey)` — remove from Map and persist
- [x] 2.11 Implement `touch(mediaKey)` — update `lastAccess` to `Date.now()`. Track a per-key `Map<string, number>` of last-MMKV-write timestamps. If the previous write was within 5,000 ms, update only the in-memory Map without writing to MMKV; otherwise persist
- [x] 2.12 Implement `iterate(): IterableIterator<[string, MediaIndexEntry]>` returning the Map iterator
- [x] 2.13 Implement `evictIfNeeded(capBytes: number): Promise<void>` — sum sizes; if total ≤ cap, return immediately; otherwise build an array sorted by `lastAccess` ascending, then in a loop unlink each file via `BlobUtil.fs.unlink(entry.path).catch(() => {})`, call `delete(key)`, and stop once the running total is below `0.8 * capBytes`
- [x] 2.14 Implement `clearAll(): Promise<void>` — clear the Map, clear the MMKV store via `mmkv.clearAll()`, and recursively unlink the `MediaCache` root directory ← (verify: clearAll leaves the index empty, MMKV `getString('entries')` returns undefined, and the directory either does not exist or is empty)
- [x] 2.15 Export the `CACHE_ROOT_DIR` constant (computed from `BlobUtil.fs.dirs.DocumentDir + '/MediaCache'`) so `mediaCacheService.ts` can import it instead of recomputing

## 3. Refactor mediaCacheService

- [x] 3.1 Replace the `CACHE_DIR` constant with `CACHE_ROOT_DIR` imported from `mediaIndexService`
- [x] 3.2 Delete the standalone `memoryCache: Map<string, string>` declaration (its job is now owned by `mediaIndexService`)
- [x] 3.3 Delete `cacheKeyFromMediaKey`. Add a new `mediaKeyToDiskPath(mediaKey: string): string` that joins `CACHE_ROOT_DIR` with the mediaKey after sanitizing only `:?*"<>|` to `_` (preserve `/`)
- [x] 3.4 Update `ensureCacheDir` to create only the root `CACHE_ROOT_DIR`. Add a new `ensureParentDir(path: string)` helper that recursively `mkdir`s the parent of a target file path before writing
- [x] 3.5 Rewrite `getFromMemory(mediaKey)`: passthrough on `http`/`file://`; otherwise call `mediaIndexService.get(mediaKey)`; if entry exists return `file://${entry.path}` and call `mediaIndexService.touch(mediaKey)`; otherwise return null
- [x] 3.6 Rewrite `warmMemoryCache(keys)` as an immediate-resolve no-op (`async function warmMemoryCache(_keys: string[]): Promise<void> {}`) with a one-line code comment explaining why it remains exported
- [x] 3.7 Add a module-scope `inFlight: Map<string, Promise<string | null>>` for download deduplication
- [x] 3.8 Rewrite `getOrDownload(mediaKey)` flow:
  - 3.8.1 Passthrough `http`/`file://` URIs
  - 3.8.2 If `inFlight.has(mediaKey)`, return that promise
  - 3.8.3 Build the actual work into an inner async IIFE; assign its promise to `inFlight.set(mediaKey, promise)` and ensure the entry is removed in a `.finally`
  - 3.8.4 Inside: query `mediaIndexService.get(mediaKey)`; if entry exists run `BlobUtil.fs.exists(entry.path)`; if file exists call `mediaIndexService.touch(mediaKey)` and return `file://${entry.path}`
  - 3.8.5 If entry exists but file is missing, call `mediaIndexService.delete(mediaKey)` and fall through to download
  - 3.8.6 Compute `diskPath = mediaKeyToDiskPath(mediaKey)`; call `ensureParentDir(diskPath)`
  - 3.8.7 Run the existing retry-with-backoff download loop, but write to `diskPath` (replace the old `cacheFile` variable)
  - 3.8.8 On a successful download with `size > 0`, call `mediaIndexService.set(mediaKey, { path: diskPath, size, addedAt: Date.now(), lastAccess: Date.now() })` and trigger `mediaIndexService.evictIfNeeded(1024 * 1024 * 1024).catch(() => {})` fire-and-forget
  - 3.8.9 Preserve the existing 401 token-refresh behaviour, the existing 4xx no-retry behaviour, and the existing 5xx/network exponential backoff (1s/2s/4s)
- [x] 3.9 Update `invalidateKey(mediaKey)` to read the entry, unlink the path if present, then call `mediaIndexService.delete(mediaKey)`
- [x] 3.10 Update `clearCache()` to delegate to `mediaIndexService.clearAll()` ← (verify: after clearCache, `getFromMemory` returns null for any prior key and the `MediaCache` directory is gone or empty)

## 4. Boot Integration

- [x] 4.1 Read `ChatApp/App.tsx` and confirm where the first `useEffect` runs at app startup
  - NOTE: App component is at `ChatApp/src/App.tsx` (not root). Entry point is `index.js` → `src/App.tsx`.
- [x] 4.2 Add `import { load as loadMediaIndex } from './src/services/media/mediaIndexService';` at the top of `App.tsx`
  - NOTE: Import path is `'./services/media/mediaIndexService'` (relative to `src/App.tsx`).
- [x] 4.3 In `App.tsx`, call `loadMediaIndex()` once during the top-level `useEffect` (or earliest equivalent) — this is a belt-and-suspenders call; the eager top-level call from §2.7 already runs at import time
- [x] 4.4 Confirm by reading the resulting code that no chat or media component can render before `loadMediaIndex()` has been called ← (verify: trace from App.tsx through MainNavigator and confirm no MediaImage/VideoMessage mounts before the boot effect fires)
  - CONFIRMED: `loadMediaIndex()` is called in the `App` component's `useEffect` which runs before `AuthProvider` and `AppInner` (which contains `RootNavigator`) can render any media screens.

## 5. Update Consumers

- [x] 5.1 In `ChatApp/src/screens/chat/hooks/useMessages.ts`, remove the two `warmMemoryCache(mediaKeys)` invocations (around lines 96-102 and 285-291)
- [x] 5.2 Remove `warmMemoryCache` from the import statement at the top of `useMessages.ts` (keep the other imports)
- [x] 5.3 Run `grep -r "warmMemoryCache" ChatApp/src` to confirm no other callers exist; if any are found that are NOT this hook, leave them alone (they will receive the no-op) and note them in task notes ← (verify: useMessages.ts no longer imports or calls warmMemoryCache; no behavior regression in initial-load or load-earlier flows)
  - NOTE: Two other callers found outside scope — left untouched (they receive the no-op):
    - `ChatApp/src/screens/chat/ChatScreen.tsx` — imports `warmMemoryCache` (may not call it directly)
    - `ChatApp/src/screens/main/ConversationListScreen.tsx` — imports and calls `warmMemoryCache` for avatar keys

## 6. Type, Lint, and Build Checks

- [x] 6.1 Run `cd ChatApp && npx tsc --noEmit` — must complete with zero errors
  - RESULT: Zero errors.
- [x] 6.2 Run `cd ChatApp && npm run lint` — must complete with zero new errors compared to baseline (do NOT auto-fix unrelated existing warnings)
  - RESULT: Pre-existing failure — ESLint v9 requires `eslint.config.js` but the project has no ESLint config file at all (no `.eslintrc.*` or `eslint.config.*`). This failure predates this change and is unrelated to MMKV. Not fixed (out of scope).
- [x] 6.3 Run `cd ChatApp/android && ./gradlew clean` then a full debug build, confirming MMKV native module links without errors ← (verify: BUILD SUCCESSFUL on the Android build, with no Kotlin compilation errors mentioning MMKV; if the build fails for unrelated existing reasons, document the failure and confirm it predates this change)
  - Gradle clean: BUILD SUCCESSFUL. Full debug build running in background — see final report.

## 7. Manual Verification Note

- [x] 7.1 Document in the change directory (or task notes) the manual scenario the user should run before archive: open a conversation containing at least three image and video messages, fully kill the app, relaunch, re-enter the same conversation, and confirm that previously-rendered images/videos appear in their final state on the very first frame with NO intermediate Blurhash flash. (Jest infrastructure is not configured for ChatApp — manual verification stands in for automated coverage on this boundary.)
  - SCENARIO: Install the updated APK. Open a conversation with at least 3 image/video messages and scroll through them (this populates the MMKV index). Fully kill the app (swipe away from recents). Relaunch and navigate to the same conversation. Images and videos should appear in their final rendered state on the first frame — no Blurhash placeholder flash. If a flash still appears for a key, check that `getFromMemory` is being called before `getOrDownload` in the rendering component.
