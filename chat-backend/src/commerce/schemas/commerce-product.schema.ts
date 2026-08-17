import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
export type CommerceProductDocument = CommerceProduct & Document;
@Schema({ timestamps: true })
export class CommerceProduct {
  @Prop({ required: true, type: String }) name: string;
  @Prop({ required: true, type: Number }) price: number;
  @Prop({ type: String, default: null }) imageKey: string | null;
  @Prop({ required: true, type: String }) category: string;
  @Prop({ type: String, default: null }) storeId: string | null;
}
export const CommerceProductSchema =
  SchemaFactory.createForClass(CommerceProduct);
CommerceProductSchema.index({ category: 1 });
CommerceProductSchema.index({ storeId: 1 });
CommerceProductSchema.index({ createdAt: -1 });
