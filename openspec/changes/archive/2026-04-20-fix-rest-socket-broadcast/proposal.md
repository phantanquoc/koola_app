---
name: fix-rest-socket-broadcast
status: draft
---

# Fix REST/Socket Broadcast Mismatch

## Problem

Frontend sends all message operations (send, delete, react, forward) via REST API.
Backend REST controllers save to MongoDB successfully but do NOT broadcast socket events to other users in the conversation room.

Result: User B does not see User A's messages/actions in real-time. They only appear after refresh or app sync.

## Affected Operations

| Operation | Frontend | REST saves | Socket broadcast |
|-----------|----------|-----------|-----------------|
| Send message | messagesApi.send() | Yes | No — BUG |
| Delete message | messagesApi.deleteMessage() | Yes | No — BUG |
| React to message | messagesApi.react() | Yes | No — BUG |
| Forward message | messagesApi.forward() | Yes | No — BUG |

## Solution

Inject ChatGateway (Socket.IO server) into MessagesController and MessagesSyncController.
After each REST operation, broadcast the corresponding socket event to the conversation room.

## Scope

- Backend only — 3 files
- No frontend changes needed (already has dedup + skip-own-message logic)
