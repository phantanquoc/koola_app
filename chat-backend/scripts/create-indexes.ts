#!/usr/bin/env ts-node
/**
 * One-time index migration for autoIndex:false rollout.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/create-indexes.ts
 *
 * Rollout note:
 *   Run BEFORE (or immediately after) deploying with `autoIndex:false` on
 *   MongooseModule.forRoot(). Until this runs, new indexes (e.g.
 *   messages {conversationId, deleted, createdAt}) remain missing but existing
 *   ones keep serving traffic. The script is additive/idempotent — safe to
 *   re-run; it calls model.createIndexes() which mirrors the schema definitions
 *   without dropping extras. Never use syncIndexes() here.
 *
 * Convention: raw mongoose driver only — NO Nest application context. See
 * scripts/seed-conversations.ts header for rationale.
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as mongoose from 'mongoose';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { UserSchema } from '../src/users/user.schema';
import { MediaSchema } from '../src/media/media.schema';
import { CommerceProductSchema } from '../src/commerce/schemas/commerce-product.schema';
import { CommerceStoreSchema } from '../src/commerce/schemas/commerce-store.schema';
import { CommerceServiceSchema } from '../src/commerce/schemas/commerce-service.schema';
import { ConversationDocSchema } from '../src/conversations/conversation.schema';
import { UserConversationSchema } from '../src/conversations/user-conversation.schema';
import { MessageSchema } from '../src/messages/message.schema';
import { StorySchema } from '../src/moments/schemas/story.schema';
import { StoryViewSchema } from '../src/moments/schemas/story-view.schema';
import { HighlightSchema } from '../src/moments/schemas/highlight.schema';
import { AudienceListSchema } from '../src/moments/schemas/audience-list.schema';
import { MusicTrackSchema } from '../src/moments/schemas/music-track.schema';
import { CallLogSchema } from '../src/call-logs/call-log.schema';
import { CallMetricSchema } from '../src/call-logs/call-metric.schema';
import { RefreshTokenSchema } from '../src/auth/refresh-token.schema';
import { AdminAuditLogSchema } from '../src/admin/schemas/admin-audit-log.schema';
import { ReportSchema } from '../src/admin/schemas/report.schema';

const MODELS: Array<[string, mongoose.Schema]> = [
  ['User', UserSchema],
  ['Media', MediaSchema],
  ['CommerceProduct', CommerceProductSchema],
  ['CommerceStore', CommerceStoreSchema],
  ['CommerceServiceDoc', CommerceServiceSchema],
  ['ConversationDoc', ConversationDocSchema],
  ['UserConversation', UserConversationSchema],
  ['Message', MessageSchema],
  ['Story', StorySchema],
  ['StoryView', StoryViewSchema],
  ['Highlight', HighlightSchema],
  ['AudienceList', AudienceListSchema],
  ['MusicTrack', MusicTrackSchema],
  ['CallLog', CallLogSchema],
  ['CallMetric', CallMetricSchema],
  ['RefreshToken', RefreshTokenSchema],
  ['AdminAuditLog', AdminAuditLogSchema],
  ['Report', ReportSchema],
];

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[create-indexes] MONGODB_URI is not set');
    process.exit(1);
  }

  console.log(`[create-indexes] Connecting to ${uri.replace(/\/\/[^@]+@/, '//***@')} ...`);
  await mongoose.connect(uri);

  try {
    for (const [name, schema] of MODELS) {
      // Register model if not yet registered (reuses existing when re-run in same process).
      const model =
        (mongoose.models[name] as mongoose.Model<unknown> | undefined) ??
        mongoose.model(name, schema);
      const indexes = await model.createIndexes();
      console.log(`  [${name}] ${Object.keys(indexes ?? {}).length} indexes ensured`);
    }
    console.log('[create-indexes] Done.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('[create-indexes] Failed:', err);
  process.exit(1);
});
