import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type StoryViewDocument = StoryView & Document;

@Schema({ timestamps: false })
export class StoryView {
  /** Shared group ID linking root story and overflow docs */
  @Prop({ required: true, type: String })
  storyGroupId: string;

  /** The specific story doc _id this view was recorded against */
  @Prop({ required: true, type: String })
  storyId: string;

  @Prop({ required: true, type: String })
  viewerId: string;

  @Prop({ required: true, type: Date, default: () => new Date() })
  viewedAt: Date;

  /**
   * Expiry — StoryViews inherit the story's expiresAt + 1h so viewers
   * remain queryable briefly after the story TTL fires.
   */
  @Prop({ type: Date, default: null })
  expiresAt: Date | null;
}

export const StoryViewSchema = SchemaFactory.createForClass(StoryView);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Dedupe: exactly one view per viewer per story group
StoryViewSchema.index({ storyGroupId: 1, viewerId: 1 }, { unique: true });

// "Who viewed" pagination query — sorted by viewedAt DESC
StoryViewSchema.index({ storyGroupId: 1, viewedAt: -1 });

// TTL for stale StoryViews (after story expires)
StoryViewSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { expiresAt: { $exists: true, $ne: null } },
  },
);
