import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AppealDocument = Appeal & Document;

export type AppealTargetType = 'ban' | 'takedown' | 'soft-delete';
export type AppealStatus = 'pending' | 'accepted' | 'rejected';

/**
 * Người dùng kháng nghị một hình phạt do admin áp. Chỉ lưu nội dung kháng nghị,
 * không lưu bản sao dữ liệu hình phạt — nguồn sự thật vẫn là User/Story/Message,
 * tránh hai bản ghi lệch nhau sau khi khôi phục.
 */
@Schema({ timestamps: true })
export class Appeal {
  @Prop({ required: true, type: String })
  userId: string;

  @Prop({ required: true, enum: ['ban', 'takedown', 'soft-delete'] })
  targetType: AppealTargetType;

  /** User id (ban), story id (takedown) hoặc message id (soft-delete). */
  @Prop({ required: true, type: String })
  targetId: string;

  @Prop({ required: true, type: String, maxlength: 2000 })
  message: string;

  @Prop({
    required: true,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
  })
  status: AppealStatus;

  @Prop({ type: String, default: null })
  decisionReason: string | null;

  @Prop({ type: String, default: null })
  decidedBy: string | null;

  @Prop({ type: Date, default: null })
  decidedAt: Date | null;
}

export const AppealSchema = SchemaFactory.createForClass(Appeal);
AppealSchema.index({ status: 1, createdAt: -1 });
