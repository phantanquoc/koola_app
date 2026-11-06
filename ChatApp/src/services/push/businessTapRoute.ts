/**
 * Decide what a tap on a business push should do (business-members task 17.2).
 *
 * Kept pure so the eviction rules are unit-testable without React Native.
 *
 * `business_session_ended` goes to EVERY FCM token of the member, including
 * the device that just won the session. Only the device named in
 * `evictedDeviceId` was actually signed out; the winner must ignore the tap.
 * A push without `evictedDeviceId` cannot be attributed, so it is ignored too —
 * the BusinessSessionGuard 401 remains the source of truth on the next call.
 *
 * Never switch INTO the business on a session-ended tap: that switch would
 * re-claim the session and evict the device that just took over.
 */
import type { PendingNotificationTap } from './pushNotificationService';

export type BusinessTapAction =
  /** Not for this device, or not a business push. */
  | { kind: 'ignore' }
  /** Evicted while acting as the business: fall back to personal, then explain. */
  | { kind: 'drop_to_personal'; businessId: string }
  /** Evicted, but already out of that business: just explain. */
  | { kind: 'notice'; businessId: string }
  /** Sensitive member event: open the business's audit log. */
  | { kind: 'open_audit_log'; businessId: string };

export function resolveBusinessTap(
  tap: Pick<PendingNotificationTap, 'type' | 'businessId' | 'evictedDeviceId'>,
  ctx: { deviceId: string | null; activeAccountId: string | undefined },
): BusinessTapAction {
  const { type, businessId } = tap;
  if (!businessId) return { kind: 'ignore' };

  if (type === 'business_session_ended') {
    if (!tap.evictedDeviceId || tap.evictedDeviceId !== ctx.deviceId) {
      return { kind: 'ignore' };
    }
    return ctx.activeAccountId === businessId
      ? { kind: 'drop_to_personal', businessId }
      : { kind: 'notice', businessId };
  }

  if (type === 'business_event') {
    return { kind: 'open_audit_log', businessId };
  }

  return { kind: 'ignore' };
}
