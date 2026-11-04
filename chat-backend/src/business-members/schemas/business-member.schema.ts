import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BusinessMemberDocument = BusinessMember & Document;

@Schema({ collection: 'business_members', timestamps: true })
export class BusinessMember {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  businessId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['owner', 'admin', 'editor', 'viewer'],
    default: 'owner',
  })
  role: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  invitedBy?: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  joinedAt: Date;

  @Prop({
    required: true,
    enum: ['active', 'suspended'],
    default: 'active',
  })
  status: string;

  @Prop({ type: Date })
  lastActiveAt?: Date;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const BusinessMemberSchema = SchemaFactory.createForClass(BusinessMember);

// Task 1.2: Compound unique index on (businessId, userId)
BusinessMemberSchema.index({ businessId: 1, userId: 1 }, { unique: true });

// Task 1.3: Index on userId for "list businesses I'm a member of" query
BusinessMemberSchema.index({ userId: 1 });
