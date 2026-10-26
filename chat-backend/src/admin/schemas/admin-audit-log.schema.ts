import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AdminAuditLogDocument = AdminAuditLog & Document;

/**
 * Danh sách action/target HỢP LỆ — một nguồn duy nhất cho union type và
 * validation DTO. Trước đây union type và DTO enum phải tự khớp tay; lệch là
 * 400 âm thầm khi thêm action mới.
 */
export const ADMIN_AUDIT_ACTIONS = [
  'approve_business',
  'reject_business',
  'bulk_approve_business',
  'bulk_reject_business',
  'ban_user',
  'unban_user',
  'update_business',
  'suspend_business',
  'unsuspend_business',
  'delete_business',
  'create_business',
  'reopen_business',
  'restore_business',
  'assign_business',
  'soft_delete_message',
  'takedown_story',
  'resolve_report',
  'dismiss_report',
  'create_product',
  'update_product',
  'delete_product',
  'create_service',
  'update_service',
  'delete_service',
  'create_store',
  'update_store',
  'delete_store',
  'create_music_track',
  'update_music_track',
  'delete_music_track',
  'broadcast',
] as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

export const ADMIN_AUDIT_TARGET_TYPES = [
  'user',
  'business',
  'message',
  'story',
  'report',
  'product',
  'service',
  'store',
  'music_track',
  'broadcast',
] as const;

export type AdminAuditTargetType = (typeof ADMIN_AUDIT_TARGET_TYPES)[number];

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
AdminAuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
