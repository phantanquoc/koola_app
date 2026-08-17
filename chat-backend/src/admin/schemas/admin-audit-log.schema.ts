import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AdminAuditLogDocument = AdminAuditLog & Document;

export type AdminAuditAction =
  | 'approve_business'
  | 'reject_business'
  | 'bulk_approve_business'
  | 'bulk_reject_business'
  | 'ban_user'
  | 'unban_user'
  | 'soft_delete_message'
  | 'takedown_story'
  | 'resolve_report'
  | 'dismiss_report'
  | 'create_product'
  | 'update_product'
  | 'delete_product'
  | 'create_service'
  | 'update_service'
  | 'delete_service'
  | 'create_store'
  | 'update_store'
  | 'delete_store'
  | 'create_music_track'
  | 'update_music_track'
  | 'delete_music_track'
  | 'broadcast';

export type AdminAuditTargetType =
  | 'user'
  | 'business'
  | 'message'
  | 'story'
  | 'report'
  | 'product'
  | 'service'
  | 'store'
  | 'music_track'
  | 'broadcast';

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AdminAuditLog {
  @Prop({ required: true, type: String })
  actorId: string;

  @Prop({ required: true, type: String })
  action: AdminAuditAction;

  @Prop({ required: true, type: String })
  targetType: AdminAuditTargetType;

  @Prop({ required: true, type: String })
  targetId: string;

  /** Redacted payload — never store raw secrets */
  @Prop({ type: Object, default: null })
  payload: Record<string, unknown> | null;

  @Prop({ type: String, default: null })
  ip: string | null;
}

export const AdminAuditLogSchema = SchemaFactory.createForClass(AdminAuditLog);

AdminAuditLogSchema.index({ createdAt: -1 });
AdminAuditLogSchema.index({ actorId: 1, createdAt: -1 });
AdminAuditLogSchema.index({ action: 1, createdAt: -1 });
