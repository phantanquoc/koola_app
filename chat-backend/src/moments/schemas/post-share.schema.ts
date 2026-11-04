import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PostShareDocument = PostShare & Document;

/**
 * Một lượt chia sẻ bài đăng.
 *
 * Thêm mới cho trang quản trị: trước đây `sharePost` chỉ `$inc shareCount` và
 * đặt một Redis key 24h để chống spam — không có row nào cho biết **ai** đã
 * chia sẻ. Số trên bài vì thế là *số lượt*, không phải *số người*, và admin
 * không thể trả lời "ai đã chia sẻ bài này".
 *
 * Ghi ở đây KHÔNG đổi `shareCount` hay response shape app: counter vẫn do
 * `sharePost` quản lý như cũ, collection này chỉ là bản ghi chi tiết.
 *
 * Một người có thể chia sẻ nhiều lần cách nhau hơn 24h (Redis key hết hạn), nên
 * index là `{ postId, userId, createdAt }` chứ không unique — danh sách admin
 * gộp theo userId và hiện lần chia sẻ gần nhất.
 */
@Schema({ timestamps: true })
export class PostShare {
  @Prop({ required: true, type: String })
  postId: string;

  @Prop({ required: true, type: String })
  userId: string;
}

export const PostShareSchema = SchemaFactory.createForClass(PostShare);

// Danh sách theo bài, mới nhất trước (trang quản trị đọc theo thứ tự này).
PostShareSchema.index({ postId: 1, createdAt: -1 });
// Đếm / gộp theo người trên một bài.
PostShareSchema.index({ postId: 1, userId: 1 });
PostShareSchema.index({ userId: 1 });
