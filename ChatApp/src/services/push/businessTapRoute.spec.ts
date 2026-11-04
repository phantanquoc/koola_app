import { resolveBusinessTap } from './businessTapRoute';

const BIZ = 'biz-1';
const ME = 'device-me';

describe('resolveBusinessTap (business-members 17.2)', () => {
  describe('business_session_ended', () => {
    const tap = (evictedDeviceId?: string) => ({
      type: 'business_session_ended',
      businessId: BIZ,
      evictedDeviceId,
    });

    it('drops to personal when this device was evicted while acting as the business', () => {
      expect(
        resolveBusinessTap(tap(ME), { deviceId: ME, activeAccountId: BIZ }),
      ).toEqual({ kind: 'drop_to_personal', businessId: BIZ });
    });

    it('only explains when this device was evicted but is already out of the business', () => {
      expect(
        resolveBusinessTap(tap(ME), { deviceId: ME, activeAccountId: 'root' }),
      ).toEqual({ kind: 'notice', businessId: BIZ });
    });

    it('is ignored on the device that WON the session (same push, other token)', () => {
      expect(
        resolveBusinessTap(tap('device-old'), { deviceId: ME, activeAccountId: BIZ }),
      ).toEqual({ kind: 'ignore' });
    });

    it('is ignored when the push names no device (cannot attribute the eviction)', () => {
      expect(
        resolveBusinessTap(tap(undefined), { deviceId: ME, activeAccountId: BIZ }),
      ).toEqual({ kind: 'ignore' });
    });

    it('is ignored when this device id is unknown', () => {
      expect(
        resolveBusinessTap(tap(ME), { deviceId: null, activeAccountId: BIZ }),
      ).toEqual({ kind: 'ignore' });
    });
  });

  it('opens the audit log for a business_event', () => {
    expect(
      resolveBusinessTap(
        { type: 'business_event', businessId: BIZ },
        { deviceId: ME, activeAccountId: 'root' },
      ),
    ).toEqual({ kind: 'open_audit_log', businessId: BIZ });
  });

  it('ignores a business push without businessId', () => {
    expect(
      resolveBusinessTap(
        { type: 'business_event' },
        { deviceId: ME, activeAccountId: BIZ },
      ),
    ).toEqual({ kind: 'ignore' });
  });

  it('ignores unrelated push types', () => {
    expect(
      resolveBusinessTap(
        { type: 'new_message', businessId: BIZ },
        { deviceId: ME, activeAccountId: BIZ },
      ),
    ).toEqual({ kind: 'ignore' });
  });
});
