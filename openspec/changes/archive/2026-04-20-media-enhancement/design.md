---
name: media-enhancement
---

# Design

## 1. Blurhash Generation (Backend)

### Message Schema Addition
```
blurhash: String (nullable, ~30 chars)
imageWidth: Number (original width)
imageHeight: Number (original height)
```

### Generation Flow
In MessagesService.sendMessage(), after creating the message:
- If type === 'image' and mediaUrl exists
- Fire-and-forget: download object from MinIO → sharp resize to 32x32 → blurhash.encode() → update message document
- Do NOT block the send response — generate async, update later
- Frontend receives blurhash via socket event or next fetch

### Libraries
- `sharp` — image processing (resize to tiny thumbnail)
- `blurhash` — encode pixel data to blurhash string

## 2. Image Caching (Frontend)

### MediaCacheService
- Location: `ChatApp/src/services/media/mediaCacheService.ts`
- Cache dir: `BlobUtil.fs.dirs.CacheDir + '/media-cache/'`
- Key: simple hash of mediaKey (replace `/` with `_`)
- API: `getOrDownload(mediaKey: string, token: string): Promise<string>` → returns `file://` path
- Max cache size: not enforced initially (OS handles cache eviction)

### Integration
- `MediaImage` and `UserAvatar` use `MediaCacheService.getOrDownload()` instead of `resolveAvatarUrl()`
- Returns local file:// URI → Image component loads from disk

## 3. Upload Progress (Frontend)

### mediaUploadService changes
- `uploadFileToMinIO()` accepts `onProgress?: (percent: number) => void`
- Uses `BlobUtil.fetch().uploadProgress()` callback
- `uploadMedia()` passes onProgress through

### useMessages changes
- Optimistic message gets `uploadProgress: number` field
- `sendMediaMessage()` accepts onProgress, updates state via setMessages

### MediaImage changes
- When `isUploading && uploadProgress !== undefined`: show progress bar overlay
- Progress bar: simple View with width percentage + text
