import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type HighlightDocument = Highlight & Document;

@Schema({ timestamps: true })
export class Highlight {
  @Prop({ required: true, type: String })
  ownerId: string;

  @Prop({ required: true, type: String, maxlength: 50 })
  title: string;

  /** MediaKey for the cover image/thumbnail */
  @Prop({ type: String, default: null })
  coverMediaKey: string | null;

  /** Ordered array of story doc IDs in this highlight */
  @Prop({ type: [String], default: [] })
  storyIds: string[];

  /** Soft-delete when empty */
  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const HighlightSchema = SchemaFactory.createForClass(Highlight);

// ─── Indexes ──────────────────────────────────────────────────────────────────

HighlightSchema.index({ ownerId: 1, createdAt: -1 });
