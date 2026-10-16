import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  AudienceScope,
  MediaType,
  MentionEntry,
} from './story.schema';

export type PostDocument = Post & Document;

export interface PostMediaItem {
  mediaKey: string;
  mediaType: MediaType;
  thumbnailKey?: string | null;
  duration?: number | null;
}

export interface PostLikeEntry {
  userId: string;
  createdAt: Date;
}

@Schema({ timestamps: true })
export class Post {
  @Prop({ required: true, type: String })
  authorId: string;

  @Prop({ type: String, default: '' })
  caption: string;

  @Prop({
    type: [
      {
        mediaKey: { type: String, required: true },
        mediaType: { type: String, enum: MediaType, required: true },
        thumbnailKey: { type: String, default: null },
        duration: { type: Number, default: null },
      },
    ],
    default: [],
  })
  media: PostMediaItem[];

  @Prop({
    type: [
      {
        userId: { type: String, required: true },
        username: { type: String, required: true },
        offset: { type: Number, required: true },
        length: { type: Number, required: true },
      },
    ],
    default: [],
  })
  mentions: MentionEntry[];

  @Prop({ required: true, type: String, enum: AudienceScope, default: AudienceScope.PUBLIC })
  audienceScope: AudienceScope;

  @Prop({ type: String, default: null })
  audienceListId: string | null;

  @Prop({
    type: [
      {
        userId: { type: String, required: true },
        createdAt: { type: Date, required: true },
      },
    ],
    default: [],
  })
  likes: PostLikeEntry[];

  @Prop({ type: Number, default: 0 })
  likeCount: number;

  @Prop({ type: Number, default: 0 })
  commentCount: number;

  @Prop({ type: Number, default: 0 })
  shareCount: number;

  /**
   * Client-generated idempotency key. Unique compound index on
   * { authorId, clientPostId } (partial) dedupes offline-queue replay.
   */
  @Prop({ type: String, default: null })
  clientPostId: string | null;

  /** Set to false on soft-delete */
  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const PostSchema = SchemaFactory.createForClass(Post);

// Primary query: author's posts in descending order
PostSchema.index({ authorId: 1, createdAt: -1 });

// Feed visibility filter branches on audienceScope
PostSchema.index({ audienceScope: 1 });

// Feed query: compound for the $or visibility filter
PostSchema.index({ authorId: 1, isActive: 1 });

// Custom-scope feed branch
PostSchema.index({ audienceListId: 1 });

// Idempotency: at most one post per (author, clientPostId). Partial so the
// many posts created WITHOUT a clientPostId don't collide on null.
PostSchema.index(
  { authorId: 1, clientPostId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      clientPostId: { $exists: true, $ne: null },
    },
  },
);
