import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
export type CommerceServiceDocument = CommerceServiceDoc & Document;
@Schema({ timestamps: true })
export class CommerceServiceDoc {
  @Prop({ required: true, type: String }) name: string;
  @Prop({ required: true, type: Number }) price: number;
  @Prop({ type: String, default: null }) category: string | null;
  @Prop({ type: String, default: null }) storeId: string | null;
  @Prop({ type: String, default: '' }) description: string;
}
export const CommerceServiceSchema =
  SchemaFactory.createForClass(CommerceServiceDoc);
CommerceServiceSchema.index({ category: 1 });
CommerceServiceSchema.index({ createdAt: -1 });
