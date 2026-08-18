import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CallLogDocument = CallLog & Document;

export type CallLogStatus =
  | 'answered'
  | 'ended'
  | 'missed'
  | 'declined'
  | 'busy'
  | 'failed'
  | 'cancelled';

export type CallLogType = 'audio' | 'video';

@Schema({ timestamps: false, collection: 'call-logs' })
export class CallLog {
  @Prop({ required: true })
  sessionId: string;

  @Prop({ required: true })
  initiatorId: string;

  @Prop({ required: true })
  targetUserId: string;

  @Prop({ required: true })
  conversationId: string;

  @Prop({ required: true, enum: ['audio', 'video'] })
  callType: CallLogType;

  @Prop({
    required: true,
    enum: [
      'answered',
      'ended',
      'missed',
      'declined',
      'busy',
      'failed',
      'cancelled',
    ],
    default: 'missed',
  })
  status: CallLogStatus;

  @Prop({ required: true, type: Date, default: () => new Date() })
  startedAt: Date;

  @Prop({ type: Date, default: null })
  answeredAt: Date | null;

  @Prop({ type: Date, default: null })
  endedAt: Date | null;

  @Prop({ type: Number, default: 0 })
  duration: number;
}

export const CallLogSchema = SchemaFactory.createForClass(CallLog);

// Indexes
CallLogSchema.index({ sessionId: 1 }, { unique: true });
CallLogSchema.index({ initiatorId: 1 });
CallLogSchema.index({ targetUserId: 1 });
CallLogSchema.index({ conversationId: 1 });
CallLogSchema.index({ startedAt: -1 });
