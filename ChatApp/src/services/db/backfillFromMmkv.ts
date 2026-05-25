/**
 * backfillFromMmkv.ts
 *
 * One-shot migration: reads every key from the legacy MMKV 'message-cache'
 * instance, upserts the messages into SQLite, deletes the MMKV payload,
 * and sets a 'backfill_done' row in sync_state so the migration never runs
 * again.
 *
 * Task 5.6 + 5.7
 *
 * Idempotent: if backfill_done is already set, returns immediately.
 * On failure: logs and continues boot — the legacy MMKV cache remains intact
 * so the user still sees messages on the legacy path.
 */

import { MMKV } from 'react-native-mmkv';
import * as messageRepository from './messageRepository';
import * as syncStateRepository from './syncStateRepository';
import type { MessageInput } from './messageRepository';
import type { IMessage } from 'react-native-gifted-chat';

const BACKFILL_DONE_KEY = 'backfill_done';
const MMKV_INSTANCE_ID = 'message-cache';
const CONV_KEY_PREFIX = 'conv:';

/**
 * Run the MMKV → SQLite backfill once.
 * Safe to call on every boot — exits immediately if already done.
 */
export async function runBackfillFromMmkv(): Promise<void> {
  // Check if already done
  if (syncStateRepository.getValue(BACKFILL_DONE_KEY) === '1') {
    return;
  }

  try {
    const mmkv = new MMKV({ id: MMKV_INSTANCE_ID });
    const allKeys = mmkv.getAllKeys();
    const convKeys = allKeys.filter((k) => k.startsWith(CONV_KEY_PREFIX));

    let totalUpserted = 0;

    for (const key of convKeys) {
      const conversationId = key.slice(CONV_KEY_PREFIX.length);
      const raw = mmkv.getString(key);
      if (!raw) continue;

      let parsed: unknown[];
      try {
        parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) continue;
      } catch {
        continue;
      }

      const inputs: MessageInput[] = [];
      for (const item of parsed) {
        const msg = item as IMessage & Record<string, unknown>;
        const id = String(msg._id ?? '');
        if (!id || id.startsWith('temp_')) continue; // skip optimistic

        inputs.push({
          id,
          conversationId,
          senderId: String((msg.user as { _id?: unknown })?._id ?? ''),
          clientMessageId:
            (msg as Record<string, unknown>).clientMessageId as string | null ?? null,
          type: String((msg as Record<string, unknown>).mediaType ?? 'text'),
          content: String(msg.text ?? ''),
          mediaKey:
            (msg as Record<string, unknown>).mediaKey as string | null ?? null,
          mediaMimeType:
            (msg as Record<string, unknown>).mediaMimeType as string | null ?? null,
          mediaSize:
            (msg as Record<string, unknown>).mediaSize as number | null ?? null,
          mediaDuration:
            (msg as Record<string, unknown>).mediaDuration as number | null ?? null,
          mediaThumbnailKey:
            (msg as Record<string, unknown>).mediaThumbnailKey as string | null ?? null,
          imageWidth:
            (msg as Record<string, unknown>).imageWidth as number | null ?? null,
          imageHeight:
            (msg as Record<string, unknown>).imageHeight as number | null ?? null,
          blurhash:
            (msg as Record<string, unknown>).blurhash as string | null ?? null,
          createdAt: msg.createdAt instanceof Date
            ? msg.createdAt.getTime()
            : new Date(msg.createdAt as string | number).getTime(),
          updatedAt: Date.now(),
          status: 'sent',
          deleted: false,
          deletedFor: [],
          readBy: [],
          reactions: Array.isArray((msg as Record<string, unknown>).reactions)
            ? (msg as Record<string, unknown>).reactions as unknown[]
            : [],
          replyTo: null,
          replyToPreview: null,
        });
      }

      if (inputs.length > 0) {
        messageRepository.upsertMany(inputs);
        totalUpserted += inputs.length;
      }

      // Delete the MMKV payload after successful upsert
      mmkv.delete(key);
    }

    // Mark backfill complete
    syncStateRepository.setValue(BACKFILL_DONE_KEY, '1');
    console.log(
      `[backfillFromMmkv] Done — upserted ${totalUpserted} messages from ${convKeys.length} conversations`,
    );
  } catch (err) {
    // Non-fatal — log and continue boot
    console.warn('[backfillFromMmkv] Backfill failed (non-fatal):', err);
  }
}
