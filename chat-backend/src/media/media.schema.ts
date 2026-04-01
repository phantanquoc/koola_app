import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MediaDocument = Media & Document;

@Schema({ timestamps: true })
export class Media {
  @Prop({ required: true, unique: true })
  mediaKey: string;

  @Prop({ required: true })
  uploaderId: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  size: number;

  @Prop({ default: false })
  deleted: boolean;

  @Prop({ type: String, default: null })
  thumbnailKey: string | null;

  @Prop({ type: String, default: null })
  conversationId: string | null;

  @Prop({ type: String, default: null })
  messageId: string | null;
}

export const MediaSchema = SchemaFactory.createForClass(Media);

// Indexes
MediaSchema.index({ mediaKey: 1 }, { unique: true });
MediaSchema.index({ uploaderId: 1 });
MediaSchema.index({ conversationId: 1 });
MediaSchema.index({ deleted: 1, createdAt: 1 });
