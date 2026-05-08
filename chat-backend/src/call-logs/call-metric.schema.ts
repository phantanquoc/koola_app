import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CallMetricDocument = CallMetric & Document;

@Schema({ timestamps: false, collection: 'call-metrics' })
export class CallMetric {
  @Prop({ required: true })
  sessionId: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true, type: Date, default: () => new Date() })
  timestamp: Date;

  @Prop({ type: Number, default: 0 })
  packetsLost: number;

  @Prop({ type: Number, default: 0 })
  packetsReceived: number;

  @Prop({ type: Number, default: 0 })
  jitterMs: number;

  @Prop({ type: Number, default: 0 })
  roundTripMs: number;

  @Prop({ type: String })
  videoResolution?: string;

  @Prop({ type: String })
  connectionType?: string;
}

export const CallMetricSchema = SchemaFactory.createForClass(CallMetric);

// Compound index for time-series query per call
CallMetricSchema.index({ sessionId: 1, timestamp: 1 });

// Per-user metrics query
CallMetricSchema.index({ userId: 1, timestamp: -1 });

// TTL index — auto-delete documents older than 30 days
CallMetricSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30 },
);
