import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MessageDocument = Message & Document;

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  VOICE = 'voice',
  VIDEO = 'video',
  SYSTEM = 'system',
}

export enum MessageStatus {
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  /**
   * READ is set on individual messages only for DIRECT conversations, by the
   * POST /conversations/:id/messages/read endpoint, for backward compatibility
   * with mobile clients that inspect the `status` field for read receipts.
   * For GROUP conversations, `status` is NOT changed to READ — use `readBy`
   * array instead for per-member read tracking.
   */
  READ = 'read',
}

@Schema({ timestamps: true })
export class Message {
  @Prop({ required: true, type: String })
  conversationId: string;

  @Prop({ required: true, type: String })
  senderId: string;

  @Prop({ required: true, enum: MessageType, default: MessageType.TEXT })
  type: MessageType;

  @Prop({ required: true, default: '' })
  content: string;

  @Prop({ enum: MessageStatus, default: MessageStatus.SENT })
  status: MessageStatus;

  @Prop({ default: '' })
  mediaUrl: string;

  @Prop({ default: '' })
  mediaMimeType: string;

  @Prop({ default: 0 })
  mediaSize: number;

  @Prop({ default: false })
  deleted: boolean;

  /** Client-generated unique ID for deduplication */
  @Prop({ type: String, default: null })
  clientMessageId: string | null;

  @Prop({
    type: [{ userId: String, emoji: String }],
    default: [],
  })
  reactions: { userId: string; emoji: string }[];

  @Prop({ type: [String], default: [] })
  deletedFor: string[];

  /**
   * Per-member read tracking. Each entry is a userId string who has read this
   * message. Uses $addToSet for idempotent updates and a multikey index for
   * efficient queries.
   */
  @Prop({ type: [String], default: [] })
  readBy: string[];

  @Prop({ type: String, default: null })
  blurhash: string | null;

  @Prop({ type: Number, default: null })
  imageWidth: number | null;

  @Prop({ type: Number, default: null })
  imageHeight: number | null;

  @Prop({ type: Number, default: null })
  mediaDuration: number | null;

  // ─── Reply (message-reply spec) ──────────────────────────────────────────
  /** ObjectId of the source message this reply quotes (string form). */
  @Prop({ type: String, default: null })
  replyTo: string | null;

  /** Denormalized preview snapshot captured at send time. Immutable. */
  @Prop({
    type: {
      senderId: { type: String, required: true },
      text: { type: String, required: false },
      mediaType: { type: String, required: false },
    },
    default: null,
  })
  replyToPreview: {
    senderId: string;
    text?: string;
    mediaType?: string;
  } | null;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Indexes
MessageSchema.index({ conversationId: 1, createdAt: -1 });
// Compound index for delta sync queries: filters by conversationId, sorts/paginates by updatedAt.
// Required by GET /messages/sync which uses updatedAt >= since for tombstone-inclusive sync.
MessageSchema.index({ conversationId: 1, updatedAt: 1 });
MessageSchema.index({ senderId: 1 });
MessageSchema.index({ clientMessageId: 1, conversationId: 1 });
MessageSchema.index({ readBy: 1 }); // multikey index for per-member read tracking
MessageSchema.index(
  { content: 'text' },
  { default_language: 'none', name: 'content_text' },
); // full-text search; default_language 'none' preserves diacritics
