import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BusinessSessionDocument = BusinessSession & Document;

@Schema({ collection: 'business_sessions', timestamps: true })
export class BusinessSession {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  businessId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  deviceId: string;

  @Prop()
  deviceModel?: string;

  @Prop()
  osVersion?: string;

  @Prop()
  appVersion?: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  lastActiveAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const BusinessSessionSchema =
  SchemaFactory.createForClass(BusinessSession);

// Task 1.8: Compound unique index on (businessId, userId) for device limit enforcement
BusinessSessionSchema.index({ businessId: 1, userId: 1 }, { unique: true });

// Task 1.9: Index on deviceId for session lookup
BusinessSessionSchema.index({ deviceId: 1 });
