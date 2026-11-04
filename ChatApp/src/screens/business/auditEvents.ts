/**
 * Vietnamese copy + presentation rules for business audit events (task 18).
 *
 * The backend stores raw event types (`member.role_changed`) and a free-form
 * `changes` / `metadata` payload. Mapping them to sentences here — rather than
 * server-side — keeps the API language-neutral and lets the list render a
 * readable line even for an event type this build has never seen.
 */
import {
  BUSINESS_ROLE_LABEL,
  type BusinessRole,
} from '../../types';

export interface AuditEventMeta {
  /** MaterialIcons glyph for the row. */
  icon: string;
  /** Short Vietnamese label for the event type. */
  label: string;
  /**
   * Sensitive events (task 18.6): access or ownership changed. Rendered with a
   * danger-tinted icon shell so a removal cannot be skimmed past.
   */
  sensitive?: boolean;
}

const EVENTS: Record<string, AuditEventMeta> = {
  'member.invited': { icon: 'mail-outline', label: 'Mời thành viên' },
  'member.role_changed': {
    icon: 'swap-horiz',
    label: 'Đổi vai trò',
    sensitive: true,
  },
  'member.removed': {
    icon: 'person-remove',
    label: 'Xoá thành viên',
    sensitive: true,
  },
  'product.created': { icon: 'add-box', label: 'Tạo sản phẩm' },
  'product.updated': { icon: 'edit', label: 'Sửa sản phẩm' },
  'product.deleted': { icon: 'delete-outline', label: 'Xoá sản phẩm', sensitive: true },
  'service.created': { icon: 'add-box', label: 'Tạo dịch vụ' },
  'service.updated': { icon: 'edit', label: 'Sửa dịch vụ' },
  'service.deleted': { icon: 'delete-outline', label: 'Xoá dịch vụ', sensitive: true },
  'order.status_changed': { icon: 'local-shipping', label: 'Cập nhật đơn hàng' },
  'order.cancelled': { icon: 'cancel', label: 'Huỷ đơn hàng' },
  'order.refunded': { icon: 'undo', label: 'Hoàn tiền', sensitive: true },
  'business.settings_changed': { icon: 'settings', label: 'Đổi cài đặt' },
  'business.deleted': {
    icon: 'warning-amber',
    label: 'Xoá doanh nghiệp',
    sensitive: true,
  },
};

/** Never returns undefined: an unknown event still renders as a plain row. */
export function auditEventMeta(eventType: string): AuditEventMeta {
  return EVENTS[eventType] ?? { icon: 'history', label: eventType };
}

/** Event types offered in the filter dropdown, in the order shown. */
export const FILTERABLE_EVENT_TYPES: readonly string[] = [
  'member.invited',
  'member.role_changed',
  'member.removed',
  'order.status_changed',
  'order.cancelled',
  'product.created',
  'product.updated',
  'product.deleted',
];

function roleLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return BUSINESS_ROLE_LABEL[value as BusinessRole] ?? value;
}

/**
 * One-line description of what happened, built from `changes` / `metadata`.
 *
 * Returns null when the payload adds nothing beyond the event label — the row
 * then shows just actor + label rather than an empty second line.
 */
export function describeAuditEvent(entry: {
  eventType: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): string | null {
  const { eventType, changes, metadata } = entry;

  if (eventType === 'member.invited') {
    const email = metadata?.email;
    const role = roleLabel(metadata?.role);
    if (typeof email === 'string' && role) return `${email} · ${role}`;
    if (typeof email === 'string') return email;
    return null;
  }

  if (eventType === 'member.role_changed') {
    // Written by BusinessMembersService as { before: {role}, after: {role} }.
    const before = changes?.before as { role?: unknown } | undefined;
    const after = changes?.after as { role?: unknown } | undefined;
    const from = roleLabel(before?.role);
    const to = roleLabel(after?.role);
    if (from && to) return `${from} → ${to}`;
    return to ? `Thành ${to}` : null;
  }

  if (eventType === 'member.removed') {
    const role = roleLabel(metadata?.removedRole);
    return role ? `Vai trò cũ: ${role}` : null;
  }

  if (eventType === 'order.status_changed' || eventType === 'order.cancelled') {
    // Written by OrdersService as { status: { before, after } }.
    const status = changes?.status as
      | { before?: unknown; after?: unknown }
      | undefined;
    const code = metadata?.orderCode;
    const parts: string[] = [];
    if (typeof code === 'string' || typeof code === 'number') {
      parts.push(`Đơn #${code}`);
    }
    if (typeof status?.before === 'string' && typeof status?.after === 'string') {
      parts.push(`${status.before} → ${status.after}`);
    }
    if (metadata?.actedAs === 'buyer') parts.push('do khách');
    const note = metadata?.note;
    if (typeof note === 'string' && note) parts.push(note);
    return parts.length ? parts.join(' · ') : null;
  }

  return null;
}
