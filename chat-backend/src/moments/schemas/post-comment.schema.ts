import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PostCommentDocument = PostComment & Document;

@Schema({ timestamps: true })
export class PostComment {
  @Prop({ required: true, type: String })
  postId: string;

  /** Null for top-level comments; set to parent comment _id for replies */
  @Prop({ type: String, default: null })
  parentId: string | null;

  @Prop({ required: true, type: String })
  authorId: string;

  @Prop({ required: true, type: String })
  content: string;

  /** Set to false on soft-delete */
  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Number, default: 0 })
  likeCount: number;
}

export const PostCommentSchema = SchemaFactory.createForClass(PostComment);

// Top-level comment listing per post (chronological)
PostCommentSchema.index({ postId: 1, createdAt: 1 });

// Reply lookup per parent
PostCommentSchema.index({ parentId: 1 });

// Cursor pagination on _id + cascade/filtered reads
PostCommentSchema.index({ postId: 1, parentId: 1, _id: 1 });
PostCommentSchema.index({ postId: 1, parentId: 1, isActive: 1 });
