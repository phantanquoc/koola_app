import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MessageDocument = Message & Document;

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  VOICE = 'voice',
  SYSTEM = 'system',
}

export enum MessageStatus {
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
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
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Indexes
MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1 });
MessageSchema.index({ clientMessageId: 1, conversationId: 1 });
