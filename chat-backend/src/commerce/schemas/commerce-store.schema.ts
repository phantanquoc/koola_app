import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
export type CommerceStoreDocument = CommerceStore & Document;
@Schema({ timestamps: true })
export class CommerceStore {
  @Prop({ required: true, type: String }) name: string;
  @Prop({ type: String, default: '' }) category: string;
  @Prop({ type: String, default: '' }) accent: string;
  @Prop({ type: String, default: '' }) icon: string;
}
export const CommerceStoreSchema = SchemaFactory.createForClass(CommerceStore);
CommerceStoreSchema.index({ createdAt: -1 });
