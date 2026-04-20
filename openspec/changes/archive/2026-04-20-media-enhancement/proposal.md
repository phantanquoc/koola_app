---
name: media-enhancement
status: draft
---

# Media Enhancement: Blurhash + Caching + Upload Progress

## Problem

1. Images show a spinner while loading — no preview. Users wait without visual feedback.
2. Images re-download every time a screen mounts — wasteful, slow on poor connections.
3. Upload shows only a generic spinner — users don't know progress or if it's stuck.

## Solution

### 1. Blurhash Thumbnails
- Backend generates blurhash string when image message is saved
- Blurhash stored inline in message document (~30 chars)
- Frontend renders blur placeholder instantly, transitions to full image

### 2. Client-side Image Caching
- Build cache layer using react-native-blob-util (already installed)
- Cache images to device disk keyed by mediaKey hash
- On mount: cache hit → show instantly, cache miss → download → cache → show

### 3. Upload Progress
- Use react-native-blob-util uploadProgress callback
- Show percentage progress bar in chat bubble during upload
- Replace generic spinner with visual progress

## Scope

- Backend: sharp + blurhash packages, Message schema update, blurhash generation
- Frontend: react-native-blurhash package, MediaCacheService, MediaImage rewrite, upload progress UI
