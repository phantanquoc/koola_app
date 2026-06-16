import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AudienceListDocument = AudienceList & Document;

@Schema({ timestamps: true })
export class AudienceList {
  @Prop({ required: true, type: String })
  ownerId: string;

  @Prop({ required: true, type: String, maxlength: 50 })
  name: string;

  /** Optional emoji icon for the list */
  @Prop({ type: String, default: '' })
  emoji: string;

  /** User IDs that are members of this list */
  @Prop({ type: [String], default: [] })
  memberIds: string[];
}

export const AudienceListSchema = SchemaFactory.createForClass(AudienceList);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Per-owner list queries
AudienceListSchema.index({ ownerId: 1, createdAt: -1 });

// Multi-key index: "find all lists containing user X"
AudienceListSchema.index({ memberIds: 1 });

// Unique name per owner
AudienceListSchema.index({ ownerId: 1, name: 1 }, { unique: true });
