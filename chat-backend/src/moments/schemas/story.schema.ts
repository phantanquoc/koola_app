import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type StoryDocument = Story & Document;

export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
}

export enum AudienceScope {
  PUBLIC = 'public',
  CONNECTIONS = 'connections',
  CUSTOM = 'custom',
}

export interface MentionEntry {
  userId: string;
  username: string;
  offset: number;
  length: number;
}

export interface MusicRef {
  trackId: string;
  startMs: number;
}

export interface ReactionEntry {
  userId: string;
  emoji: string;
  createdAt: Date;
}

@Schema({ timestamps: true })
export class Story {
  /** Shared groupId linking root doc and overflow docs */
  @Prop({ required: true, type: String })
  storyGroupId: string;

  /** 1 = root doc; >1 = overflow doc */
  @Prop({ required: true, type: Number, default: 1 })
  overFlowIndex: number;

  @Prop({ required: true, type: String })
  authorId: string;

  /** MinIO object key for the media file */
  @Prop({ required: true, type: String })
  mediaKey: string;

  @Prop({ required: true, enum: MediaType })
  mediaType: MediaType;

  /** MinIO key for video thumbnail (video stories only) */
  @Prop({ type: String, default: null })
  thumbnailKey: string | null;

  /** Video duration in seconds */
  @Prop({ type: Number, default: null })
  duration: number | null;

  @Prop({ type: String, default: '' })
  caption: string;

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

  @Prop({
    type: {
      trackId: { type: String, required: true },
      startMs: { type: Number, required: true, default: 0 },
    },
    default: null,
  })
  musicRef: MusicRef | null;

  @Prop({ required: true, enum: AudienceScope, default: AudienceScope.PUBLIC })
  audienceScope: AudienceScope;

  @Prop({ type: String, default: null })
  audienceListId: string | null;

  @Prop({
    type: [
      {
        userId: { type: String, required: true },
        emoji: { type: String, required: true },
        createdAt: { type: Date, required: true },
      },
    ],
    default: [],
  })
  reactions: ReactionEntry[];

  /** Approximate view count — updated by Redis flush cron */
  @Prop({ type: Number, default: 0 })
  viewCount: number;

  /** True when overflow docs exist for this storyGroupId */
  @Prop({ type: Boolean, default: false })
  hasOverflow: boolean;

  /** Set to false on soft-delete */
  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  /**
   * Expiry timestamp — MongoDB TTL index fires ~60s after this date.
   * Set to null for Highlights (permanent retention).
   * partialFilterExpression ensures TTL skips docs with expiresAt: null.
   */
  @Prop({ type: Date, default: null })
  expiresAt: Date | null;

  /**
   * Client-generated idempotency key. When present, a unique compound index
   * on { authorId, clientStoryId } prevents the offline queue from creating
   * duplicate stories on replay. Null/absent for stories created without one.
   */
  @Prop({ type: String, default: null })
  clientStoryId: string | null;
}

export const StorySchema = SchemaFactory.createForClass(Story);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Primary query: author's stories in descending order
StorySchema.index({ authorId: 1, createdAt: -1 });

// TTL index: only fires for documents where expiresAt is a real date (not null)
StorySchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { expiresAt: { $exists: true, $ne: null } },
  },
);

// Outlier pattern: find all docs in a story group (root + overflow)
StorySchema.index({ storyGroupId: 1, overFlowIndex: 1 });

// Feed query: filter by audienceListId for custom-scope stories
StorySchema.index({ audienceListId: 1 });

// Feed query: compound index for the $or feed query
StorySchema.index({ authorId: 1, expiresAt: 1, isActive: 1 });

// Feed query: the $or visibility filter branches on audienceScope (PUBLIC /
// CONNECTIONS / CUSTOM). A dedicated scope index lets each branch resolve via
// index instead of scanning; low cardinality but every story carries the field.
StorySchema.index({ audienceScope: 1 });

// Idempotency: at most one story per (author, clientStoryId). Partial filter
// so the many stories created WITHOUT a clientStoryId don't collide on null.
StorySchema.index(
  { authorId: 1, clientStoryId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      clientStoryId: { $exists: true, $ne: null },
    },
  },
);
