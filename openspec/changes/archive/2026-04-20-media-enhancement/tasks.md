---
name: media-enhancement
---

# Tasks

## Backend — Blurhash

- [x] Install sharp and blurhash packages in chat-backend
- [x] Add blurhash, imageWidth, imageHeight fields to Message schema
- [x] Create blurhash generation utility function in messages service
- [x] Integrate async blurhash generation in MessagesService.sendMessage for image messages
- [x] Broadcast updated message with blurhash via socket after generation (message_updated event)

## Frontend — Caching

- [x] Create MediaCacheService with getOrDownload method using react-native-blob-util
- [x] Update MediaImage component to use MediaCacheService instead of resolveAvatarUrl
- [x] Update UserAvatar component to use MediaCacheService instead of resolveAvatarUrl

## Frontend — Blurhash Display

- [x] Install react-native-blurhash package in ChatApp
- [x] Update MediaImage to show Blurhash placeholder while loading, fade to real image
- [x] Add message_updated socket listener in useMessages for blurhash updates

## Frontend — Upload Progress

- [x] Add onProgress callback to uploadFileToMinIO and uploadMedia functions
- [x] Update useMessages.sendMediaMessage to include uploadProgress in optimistic message
- [x] Update MediaImage to render progress bar overlay when uploading
- [x] Wire ChatScreen upload handlers to pass progress through
- [x] Update renderFooter to show upload percentage
