import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ReportDocument = Report & Document;

export type ReportTargetType = 'message' | 'story' | 'user' | 'conversation';
export type ReportStatus = 'pending' | 'resolved' | 'dismissed';

@Schema({ timestamps: true })
export class Report {
  @Prop({ required: true, type: String })
  reporterId: string;

  @Prop({ required: true, enum: ['message', 'story', 'user', 'conversation'] })
  targetType: ReportTargetType;

  @Prop({ required: true, type: String })
  targetId: string;

  @Prop({ required: true, type: String, maxlength: 1000 })
  reason: string;

  @Prop({
    required: true,
    enum: ['pending', 'resolved', 'dismissed'],
    default: 'pending',
  })
  status: ReportStatus;

  @Prop({ type: String, default: null })
  resolvedBy: string | null;

  @Prop({ type: Date, default: null })
  resolvedAt: Date | null;
}

export const ReportSchema = SchemaFactory.createForClass(Report);
ReportSchema.index({ status: 1, createdAt: -1 });
ReportSchema.index({ targetType: 1, status: 1 });
ReportSchema.index({ reporterId: 1 });
