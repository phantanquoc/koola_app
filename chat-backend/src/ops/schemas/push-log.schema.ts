import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PushLogDocument = PushLog & Document;

export const PUSH_LOG_TTL_SECONDS = 90 * 24 * 60 * 60;

/**
 * Một lần gửi push tới MỘT người nhận — đếm token để biết vì sao push trượt
 * (0 token, token chết, FCM lỗi) mà không phải đọc log server.
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class PushLog {
  @Prop({ required: true, type: String })
  userId: string;

  @Prop({ required: true, type: Number, default: 0 })
  tokenCount: number;

  @Prop({ required: true, type: Number, default: 0 })
  successCount: number;

  @Prop({ required: true, type: Number, default: 0 })
  failureCount: number;

  @Prop({ type: String, default: '' })
  title: string;

  @Prop({ type: String, default: '' })
  body: string;

  /** Loại push (message, mention, order…) — hiện chỉ ghi cho message. */
  @Prop({ required: true, type: String, default: 'message' })
  kind: string;
}

export const PushLogSchema = SchemaFactory.createForClass(PushLog);

PushLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: PUSH_LOG_TTL_SECONDS },
);
PushLogSchema.index({ userId: 1, createdAt: -1 });
PushLogSchema.index({ kind: 1, createdAt: -1 });
