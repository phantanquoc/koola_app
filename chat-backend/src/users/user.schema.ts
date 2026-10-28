import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type UserDocument = User & Document;

export type AccountType = 'personal' | 'business';
export type VerificationStatus = 'pending' | 'verified' | 'rejected';
export type BusinessRelationshipType = 'partner' | 'supplier';
export type AdminRole = 'super' | 'moderator' | 'support';

@Schema({ timestamps: true })
export class User {
  // ─── Account type & ownership ────────────────────────────────────────────────

  @Prop({ enum: ['personal', 'business'], default: 'personal' })
  accountType: AccountType;

  /** Set only on business accounts — references the root owner User */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  ownerUserId?: Types.ObjectId;

  // ─── Credentials (optional at schema level; enforced by service for personal) ─

  /** Sparse unique: null/absent does not collide (for business accounts) */
  @Prop()
  email?: string;

  @Prop()
  passwordHash?: string;

  // ─── Personal profile fields ─────────────────────────────────────────────────

  @Prop({ unique: true, sparse: true })
  phone?: string;

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

  // ─── Business profile fields (only set when accountType === 'business') ───────

  @Prop()
  businessCategory?: string;

  @Prop()
  province?: string;

  @Prop({ enum: ['partner', 'supplier'] })
  relationshipType?: BusinessRelationshipType;

  @Prop({ maxlength: 200 })
  tagline?: string;

  @Prop({ maxlength: 2000 })
  description?: string;

  @Prop()
  address?: string;

  @Prop()
  website?: string;

  @Prop()
  contactEmail?: string;

  @Prop()
  contactPhone?: string;

  @Prop()
  taxCode?: string;

  @Prop({ type: Date })
  licenseExpiresAt?: Date;

  /** MinIO/S3 key for the business logo */
  @Prop()
  logoKey?: string;

  /** MinIO/S3 key for the business cover/banner image */
  @Prop()
  coverKey?: string;

  /** MinIO/S3 key for the business license image */
  @Prop()
  licenseImageKey?: string;

  // ─── Verification & moderation ───────────────────────────────────────────────

  @Prop({ enum: ['pending', 'verified', 'rejected'], default: 'pending' })
  verificationStatus?: VerificationStatus;

  @Prop()
  rejectionReason?: string;

  @Prop({
    type: [
      {
        status: { type: String },
        at: { type: Date },
        actorId: { type: String },
        reason: { type: String },
      },
    ],
    default: [],
  })
  verificationHistory?: {
    status: string;
    at: Date;
    actorId?: string;
    reason?: string;
  }[];

  @Prop({ default: false })
  suspended?: boolean;

  @Prop()
  internalNote?: string;

  @Prop()
  assignee?: string;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;

  @Prop({ default: false })
  isBanned: boolean;

  @Prop({ type: String, default: null })
  banReason: string | null;

  @Prop({ type: Date, default: null })
  bannedUntil: Date | null;

  /** Vai trò trong khu admin. null = super (tương thích admin cũ chưa có role). */
  @Prop({ type: String, enum: ['super', 'moderator', 'support'], default: null })
  adminRole?: AdminRole | null;

  // ─── Admin login trail & 2FA ─────────────────────────────────────────────────

  @Prop({ type: Date, default: null })
  lastLoginAt?: Date | null;

  @Prop({ type: String, default: null })
  lastLoginIp?: string | null;

  @Prop({ default: false })
  twoFactorEnabled?: boolean;

  /** Base32 TOTP secret — never returned by any admin projection. */
  @Prop({ type: String, default: null })
  twoFactorSecret?: string | null;

  /** SHA-256 hashes of one-time recovery codes (plaintext shown once). */
  @Prop({ type: [String], default: [] })
  twoFactorRecoveryCodes?: string[];

  /** Platform administration authority — set out-of-band only (see scripts/grant-admin.ts) */
  @Prop({ default: false })
  isPlatformAdmin: boolean;

  // ─── Online presence ─────────────────────────────────────────────────────────

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
    default: {
      notificationsEnabled: true,
      preferredLanguage: 'vi',
      autoTranslateEnabled: false,
    },
  })
  settings: {
    notificationsEnabled: boolean;
    /** ISO 639-1 language code for translation target. Default "vi". */
    preferredLanguage?: string;
    /** Whether incoming foreign-language messages should be auto-translated. */
    autoTranslateEnabled?: boolean;
  };
}

export const UserSchema = SchemaFactory.createForClass(User);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// NOTE: email unique + sparse here — NO @Prop({ unique: true }) flag above to
// avoid the duplicate-index warning (CLAUDE.md: use schema.index() only).
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ createdAt: -1 });
// accountType đơn lẻ đã bị phủ bởi compound bên dưới (prefix trái)
UserSchema.index({ ownerUserId: 1 });
UserSchema.index({ relationshipType: 1 });
UserSchema.index({ province: 1 });
UserSchema.index({ businessCategory: 1 });
UserSchema.index({ verificationStatus: 1 });
// Compound cho truy vấn chính của trang admin Doanh nghiệp:
// accountType + deletedAt + verificationStatus + sort createdAt / licenseExpiresAt.
UserSchema.index({ accountType: 1, deletedAt: 1, verificationStatus: 1, createdAt: -1 });
UserSchema.index({ accountType: 1, deletedAt: 1, licenseExpiresAt: 1 });
UserSchema.index({ ownerUserId: 1, accountType: 1, deletedAt: 1 });
