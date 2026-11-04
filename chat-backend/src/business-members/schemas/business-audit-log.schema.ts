import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BusinessAuditLogDocument = BusinessAuditLog & Document;

@Schema({ collection: 'business_audit_logs', timestamps: true })
export class BusinessAuditLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  businessId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actorId: Types.ObjectId;

  @Prop({ required: true })
  eventType: string;

  @Prop()
  resourceId?: string;

  @Prop({ type: Object })
  changes?: Record<string, any>;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop()
  deviceId?: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const BusinessAuditLogSchema =
  SchemaFactory.createForClass(BusinessAuditLog);

// Task 1.11: Compound index on (businessId, createdAt) for time-range queries
BusinessAuditLogSchema.index({ businessId: 1, createdAt: -1 });

// Task 1.12: Index on eventType for filtered queries
BusinessAuditLogSchema.index({ eventType: 1 });

// Task 1.13: TTL index on createdAt with 90-day expiry for auto-deletion
BusinessAuditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }, // 90 days
);
