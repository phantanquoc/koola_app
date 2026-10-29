import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CommentLikeDocument = CommentLike & Document;

@Schema({ timestamps: true })
export class CommentLike {
  @Prop({ required: true, type: String })
  commentId: string;

  @Prop({ required: true, type: String })
  postId: string;

  @Prop({ required: true, type: String })
  userId: string;
}

export const CommentLikeSchema = SchemaFactory.createForClass(CommentLike);
CommentLikeSchema.index({ commentId: 1, userId: 1 }, { unique: true });
CommentLikeSchema.index({ commentId: 1 });
CommentLikeSchema.index({ userId: 1 });
