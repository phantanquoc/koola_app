import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BusinessInviteDocument = BusinessInvite & Document;

@Schema({ collection: 'business_invites', timestamps: true })
export class BusinessInvite {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  businessId: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({
    required: true,
    enum: ['admin', 'editor', 'viewer'],
  })
  role: string;

  @Prop({ required: true })
  token: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  invitedBy: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({
    required: true,
    enum: ['pending', 'accepted', 'revoked'],
    default: 'pending',
  })
  status: string;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const BusinessInviteSchema =
  SchemaFactory.createForClass(BusinessInvite);

// Task 1.5: Index on token for invite verification lookup
BusinessInviteSchema.index({ token: 1 }, { unique: true });

// Task 1.6: Index on (businessId, status) for listing pending invites
BusinessInviteSchema.index({ businessId: 1, status: 1 });
