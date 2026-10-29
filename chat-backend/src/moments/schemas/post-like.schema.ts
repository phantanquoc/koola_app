import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PostLikeDocument = PostLike & Document;

@Schema({ timestamps: true })
export class PostLike {
  @Prop({ required: true, type: String })
  postId: string;

  @Prop({ required: true, type: String })
  userId: string;
}

export const PostLikeSchema = SchemaFactory.createForClass(PostLike);
PostLikeSchema.index({ postId: 1, userId: 1 }, { unique: true });
PostLikeSchema.index({ postId: 1 });
PostLikeSchema.index({ userId: 1 });
