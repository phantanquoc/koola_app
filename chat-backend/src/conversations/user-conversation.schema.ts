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
}

export const UserConversationSchema =
  SchemaFactory.createForClass(UserConversation);

// Compound unique index — one entry per user per conversation
UserConversationSchema.index(
  { userId: 1, conversationId: 1 },
  { unique: true },
);
UserConversationSchema.index({ conversationId: 1 });
