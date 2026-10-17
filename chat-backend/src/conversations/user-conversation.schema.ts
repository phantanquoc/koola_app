import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserConversationDocument = UserConversation & Document;

@Schema({ timestamps: true })
export class UserConversation {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Conversation' })
  conversationId: Types.ObjectId;

  @Prop({ required: true, type: Number, default: 0 })
  unreadCount: number;

  @Prop({ type: Types.ObjectId, default: null })
  lastReadMessageId: Types.ObjectId | null;

  @Prop({ required: true, type: Date, default: () => new Date() })
  joinedAt: Date;

  // ─── Private per-user conversation prefs (conversation-quick-actions) ─────
  // All default null; docs created before these fields existed read as null.

  /** Set when the user pinned this conversation; null = not pinned. */
  @Prop({ type: Date, default: null })
  pinnedAt: Date | null;

  /** Push mute expiry; muted iff mutedUntil > now. "forever" = 9999-12-31 sentinel. */
  @Prop({ type: Date, default: null })
  mutedUntil: Date | null;

  /** History cutoff for "clear for me": reads only return createdAt > clearedAt. */
  @Prop({ type: Date, default: null })
  clearedAt: Date | null;

  /** Hidden from the list until the next persisted message clears it. */
  @Prop({ type: Date, default: null })
  hiddenAt: Date | null;
}

export const UserConversationSchema =
  SchemaFactory.createForClass(UserConversation);

// Compound unique index — one entry per user per conversation
UserConversationSchema.index(
  { userId: 1, conversationId: 1 },
  { unique: true },
);
UserConversationSchema.index({ conversationId: 1 });
// Conversation list: per-user memberships sorted by joinedAt desc (getConversationList
// pagination). Covers { userId } equality + joinedAt sort without a blocking sort.
UserConversationSchema.index({ userId: 1, joinedAt: -1 });
// Pinned group on page 1 of the conversation list + pin-limit count.
UserConversationSchema.index({ userId: 1, pinnedAt: -1 });
