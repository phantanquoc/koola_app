import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BroadcastLogDocument = BroadcastLog & Document;

/**
 * Nguồn sự thật cho union audience — DTO và schema cùng import để thêm loại
 * mới không phải sửa hai nơi (lệch là validation 400 âm thầm).
 */
export const BROADCAST_AUDIENCES = [
  'all',
  'personal',
  'business',
  'ids',
] as const;

export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class BroadcastLog {
  @Prop({ required: true, type: String, maxlength: 200 })
  title: string;

  @Prop({ required: true, type: String, maxlength: 2000 })
  body: string;

  @Prop({
    required: true,
    type: String,
    enum: BROADCAST_AUDIENCES,
    default: 'all',
  })
  audience: BroadcastAudience;

  /** Chỉ có ý nghĩa khi audience='ids'; các loại khác luôn rỗng. */
  @Prop({ type: [String], default: [] })
  audienceIds: string[];

  @Prop({ required: true, type: String })
  sentBy: string;

  /** Số socket khớp tại thời điểm gửi — độ phủ thật để đối soát. */
  @Prop({ required: true, type: Number, default: 0 })
  recipientsOnline: number;

  /**
   * Số thiết bị nhận push qua FCM cho người không có socket. Chỉ > 0 khi
   * `audience='ids'` và có người trong danh sách đang offline: các audience khác
   * đếm theo socket nên không biết ai offline để push.
   */
  @Prop({ type: Number, default: 0 })
  pushDelivered: number;
}

export const BroadcastLogSchema = SchemaFactory.createForClass(BroadcastLog);

BroadcastLogSchema.index({ createdAt: -1 });
