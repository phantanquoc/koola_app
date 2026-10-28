import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OtpLogDocument = OtpLog & Document;

export const OTP_LOG_CHANNELS = ['sms', 'email'] as const;
export type OtpLogChannel = (typeof OTP_LOG_CHANNELS)[number];

export const OTP_LOG_TTL_SECONDS = 90 * 24 * 60 * 60;

/**
 * Một lần gửi OTP — KHÔNG bao giờ chứa mã OTP hay hash của nó.
 * Chỉ đủ để trả lời "gửi có thành công không, qua kênh nào, lỗi gì".
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class OtpLog {
  /** SĐT (sms) hoặc email (email) — che khi trả ra API. */
  @Prop({ required: true, type: String })
  phone: string;

  @Prop({ required: true, enum: OTP_LOG_CHANNELS, type: String })
  channel: OtpLogChannel;

  /** Mục đích gửi (register, reset_password, phone_change…) để lọc sự cố. */
  @Prop({ required: true, type: String, default: 'otp' })
  purpose: string;

  @Prop({ required: true, type: Boolean })
  success: boolean;

  @Prop({ type: String, default: null })
  error: string | null;

  @Prop({ required: true, type: String })
  provider: string;

  /** Chỉ có khi provider trả về (Plivo Verify session). */
  @Prop({ type: String, default: null })
  sessionUuid: string | null;

  @Prop({ type: String, default: null })
  ip: string | null;
}

export const OtpLogSchema = SchemaFactory.createForClass(OtpLog);

// TTL 90 ngày: log vận hành, không phải hồ sơ — tự dọn thay vì chạy cron.
OtpLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: OTP_LOG_TTL_SECONDS },
);
OtpLogSchema.index({ phone: 1, createdAt: -1 });
OtpLogSchema.index({ success: 1, createdAt: -1 });
