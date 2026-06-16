import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ unique: true, sparse: true })
  phone?: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true })
  displayName: string;

  @Prop({ default: '' })
  avatar: string;

  @Prop({ maxlength: 160 })
  bio?: string;

  @Prop({ unique: true, sparse: true, lowercase: true, maxlength: 30 })
  username?: string;

  @Prop({ maxlength: 2048 })
  coverPhoto?: string;

  @Prop({ type: Date })
  dateOfBirth?: Date;

  @Prop({ enum: ['male', 'female', 'other', 'prefer_not'] })
  gender?: string;

  @Prop({ default: false })
  isOnline: boolean;

  @Prop({ type: Date, default: Date.now })
  lastSeen: Date;

  @Prop({
    type: [{ token: String, platform: String, createdAt: Date }],
    default: [],
  })
  fcmTokens: { token: string; platform: string; createdAt: Date }[];

  @Prop({
    type: Object,
    default: { notificationsEnabled: true },
  })
  settings: { notificationsEnabled: boolean };
}

export const UserSchema = SchemaFactory.createForClass(User);

// Indexes — email unique index created automatically by @Prop unique: true above
UserSchema.index({ createdAt: -1 });
