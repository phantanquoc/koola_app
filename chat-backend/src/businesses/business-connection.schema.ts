import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BusinessConnectionDocument = BusinessConnection & Document;

@Schema({ timestamps: true })
export class BusinessConnection {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Business' })
  businessId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;
}

export const BusinessConnectionSchema =
  SchemaFactory.createForClass(BusinessConnection);

// Unique compound: one connection per user per business
BusinessConnectionSchema.index({ businessId: 1, userId: 1 }, { unique: true });
BusinessConnectionSchema.index({ userId: 1 });
