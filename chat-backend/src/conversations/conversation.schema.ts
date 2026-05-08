import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ConversationDocument = ConversationDoc & Document;

export enum ConversationType {
  DIRECT = 'direct',
  GROUP = 'group',
}

export enum MemberRole {
  ADMIN = 'admin',
  MEMBER = 'member',
}

@Schema()
export class Member {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: MemberRole, default: MemberRole.MEMBER })
  role: MemberRole;

  @Prop({ required: true, type: Date, default: () => new Date() })
  joinedAt: Date;
}

export const MemberSchema = SchemaFactory.createForClass(Member);

@Schema()
export class PinnedMessage {
  @Prop({ required: true, type: String })
  messageId: string;

  @Prop({ required: true, type: String })
  pinnedBy: string;

  @Prop({ required: true, type: Date, default: () => new Date() })
  pinnedAt: Date;
}

export const PinnedMessageSchema = SchemaFactory.createForClass(PinnedMessage);

@Schema({ timestamps: true })
export class ConversationDoc {
  @Prop({ required: true, enum: ConversationType })
  type: ConversationType;

  @Prop({ type: String, default: null })
  name: string | null;

  @Prop({ type: String, default: null })
  avatar: string | null;

  @Prop({ required: true, type: [MemberSchema] })
  members: Member[];

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ type: Date, default: null })
  lastMessageAt: Date | null;

  @Prop({ type: String, default: null })
  lastMessagePreview: string | null;

  @Prop({ type: [PinnedMessageSchema], default: [] })
  pinnedMessages: PinnedMessage[];
}

export const ConversationDocSchema =
  SchemaFactory.createForClass(ConversationDoc);

// Indexes
ConversationDocSchema.index({ 'members.userId': 1 }); // multikey
ConversationDocSchema.index({ lastMessageAt: -1 });
ConversationDocSchema.index({ type: 1 });
