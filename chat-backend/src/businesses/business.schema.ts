import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BusinessDocument = Business & Document;

export enum RelationshipType {
  PARTNER = 'partner',
  SUPPLIER = 'supplier',
}

@Schema({ timestamps: true })
export class Business {
  @Prop({ required: true, type: String })
  name: string;

  @Prop({ type: String, default: '' })
  logoKey: string;

  @Prop({ type: String, default: '' })
  tagline: string;

  @Prop({ type: String, default: '' })
  description: string;

  @Prop({ required: true, enum: RelationshipType })
  relationshipType: RelationshipType;

  @Prop({ required: true, type: String })
  category: string;

  @Prop({ required: true, type: String })
  province: string;

  @Prop({ type: String, default: '' })
  address: string;

  @Prop({ type: String, default: '' })
  website: string;

  @Prop({ type: String, default: '' })
  contactEmail: string;

  @Prop({ type: String, default: '' })
  contactPhone: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  ownerId: Types.ObjectId;

  @Prop({ type: Number, default: 0 })
  connectionCount: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  connectedUserIds: Types.ObjectId[];

  @Prop({ type: Boolean, default: false })
  isVerified: boolean;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const BusinessSchema = SchemaFactory.createForClass(Business);

// Indexes
BusinessSchema.index({ name: 'text' });
BusinessSchema.index({ relationshipType: 1 });
BusinessSchema.index({ category: 1 });
BusinessSchema.index({ province: 1 });
BusinessSchema.index({ isActive: 1, createdAt: -1 });
BusinessSchema.index({ ownerId: 1 });
BusinessSchema.index({ connectedUserIds: 1 });
