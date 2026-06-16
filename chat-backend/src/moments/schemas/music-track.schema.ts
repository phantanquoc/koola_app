import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MusicTrackDocument = MusicTrack & Document;

export enum LicenseType {
  CC0 = 'cc0',
  CC_BY = 'cc-by',
  EPIDEMIC_SOUND = 'epidemic-sound',
  OWNED_BY_KOOLA = 'owned-by-koola',
}

@Schema({ timestamps: false })
export class MusicTrack {
  @Prop({ required: true, type: String })
  title: string;

  @Prop({ required: true, type: String })
  artist: string;

  /** Duration in milliseconds */
  @Prop({ required: true, type: Number })
  durationMs: number;

  /** MinIO key for the full audio file */
  @Prop({ required: true, type: String })
  audioKey: string;

  /** MinIO key for a 15–30s preview clip */
  @Prop({ required: true, type: String })
  previewKey: string;

  @Prop({ required: true, enum: LicenseType })
  licenseType: LicenseType;

  /** URL to the license text */
  @Prop({ required: true, type: String })
  licenseUrl: string;

  /** Source URL where the track was obtained */
  @Prop({ required: true, type: String })
  sourceUrl: string;

  /** Attribution string (required for CC-BY) */
  @Prop({ type: String, default: '' })
  attribution: string;

  /** User ID of the admin who added the track */
  @Prop({ required: true, type: String })
  addedBy: string;

  @Prop({ required: true, type: Date, default: () => new Date() })
  addedAt: Date;

  /** Soft-delete flag — never hard-delete */
  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  /** Usage count for trending sort (updated periodically) */
  @Prop({ type: Number, default: 0 })
  usageCount: number;

  @Prop({ type: [String], default: [] })
  tags: string[];
}

export const MusicTrackSchema = SchemaFactory.createForClass(MusicTrack);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Browse active tracks sorted by addedAt
MusicTrackSchema.index({ isActive: 1, addedAt: -1 });

// Tag filter
MusicTrackSchema.index({ tags: 1 });

// Full-text search on title and artist
MusicTrackSchema.index(
  { title: 'text', artist: 'text' },
  { default_language: 'none', name: 'music_text' },
);
