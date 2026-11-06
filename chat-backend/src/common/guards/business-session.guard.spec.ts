import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import {
  BusinessSessionGuard,
  BUSINESS_SESSION_ENDED,
} from './business-session.guard';
import { SKIP_BUSINESS_SESSION_KEY } from '../decorators/skip-business-session.decorator';

const BUSINESS_ID = new Types.ObjectId().toHexString();
const ACTOR_ID = new Types.ObjectId().toHexString();

type ReqUser = { userId?: string; actorId?: string; accountType?: string };

function makeContext(opts: {
  user?: ReqUser;
  deviceId?: string | string[];
  type?: string;
}): ExecutionContext {
  const headers: Record<string, string | string[] | undefined> = {};
  if (opts.deviceId !== undefined) headers['x-device-id'] = opts.deviceId;
  return {
    getType: () => opts.type ?? 'http',
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => ({ headers, user: opts.user }),
    }),
  } as unknown as ExecutionContext;
}

const businessUser: ReqUser = {
  userId: BUSINESS_ID,
  actorId: ACTOR_ID,
  accountType: 'business',
};

describe('BusinessSessionGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let lean: jest.Mock;
  let sessionModel: { findOne: jest.Mock };
  let guard: BusinessSessionGuard;

  /** Make the next session lookup resolve to `row`. */
  const sessionRow = (row: { deviceId: string } | null) => lean.mockResolvedValue(row);

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    lean = jest.fn();
    const select = jest.fn().mockReturnValue({ lean });
    sessionModel = { findOne: jest.fn().mockReturnValue({ select }) };
    guard = new BusinessSessionGuard(
      reflector as unknown as Reflector,
      sessionModel as never,
    );
  });

  it('passes a personal session without touching the DB', async () => {
    const ctx = makeContext({
      user: { userId: ACTOR_ID, actorId: ACTOR_ID, accountType: 'personal' },
      deviceId: 'device-a',
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(sessionModel.findOne).not.toHaveBeenCalled();
  });

  it('passes a public route (no request.user)', async () => {
    await expect(
      guard.canActivate(makeContext({ deviceId: 'device-a' })),
    ).resolves.toBe(true);
    expect(sessionModel.findOne).not.toHaveBeenCalled();
  });

  it('passes a business request without X-Device-ID (client not tracking devices)', async () => {
    await expect(
      guard.canActivate(makeContext({ user: businessUser })),
    ).resolves.toBe(true);
    expect(sessionModel.findOne).not.toHaveBeenCalled();
  });

  it('passes when no session row exists (never claimed / released by logout)', async () => {
    sessionRow(null);
    await expect(
      guard.canActivate(makeContext({ user: businessUser, deviceId: 'device-a' })),
    ).resolves.toBe(true);
  });

  it('passes when the session row names this device', async () => {
    sessionRow({ deviceId: 'device-a' });
    await expect(
      guard.canActivate(makeContext({ user: businessUser, deviceId: 'device-a' })),
    ).resolves.toBe(true);
  });

  it('looks the session up by (businessId, actorId) — the member, not the business', async () => {
    sessionRow({ deviceId: 'device-a' });
    await guard.canActivate(makeContext({ user: businessUser, deviceId: 'device-a' }));

    const filter = sessionModel.findOne.mock.calls[0][0];
    expect(filter.businessId.toHexString()).toBe(BUSINESS_ID);
    expect(filter.userId.toHexString()).toBe(ACTOR_ID);
  });

  it('401s with BUSINESS_SESSION_ENDED when another device holds the session', async () => {
    sessionRow({ deviceId: 'device-b' });
    const ctx = makeContext({ user: businessUser, deviceId: 'device-a' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(ctx)).rejects.toThrow(BUSINESS_SESSION_ENDED);
  });

  it('uses the first value when X-Device-ID arrives as an array', async () => {
    sessionRow({ deviceId: 'device-a' });
    await expect(
      guard.canActivate(
        makeContext({ user: businessUser, deviceId: ['device-a', 'device-b'] }),
      ),
    ).resolves.toBe(true);
  });

  it('skips routes marked @SkipBusinessSessionCheck (switch / logout)', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    sessionRow({ deviceId: 'device-b' });

    await expect(
      guard.canActivate(makeContext({ user: businessUser, deviceId: 'device-a' })),
    ).resolves.toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      SKIP_BUSINESS_SESSION_KEY,
      expect.any(Array),
    );
    expect(sessionModel.findOne).not.toHaveBeenCalled();
  });

  it('ignores non-HTTP contexts (WebSocket handlers)', async () => {
    await expect(
      guard.canActivate(
        makeContext({ user: businessUser, deviceId: 'device-a', type: 'ws' }),
      ),
    ).resolves.toBe(true);
    expect(sessionModel.findOne).not.toHaveBeenCalled();
  });

  it('passes on malformed ids instead of throwing a CastError', async () => {
    await expect(
      guard.canActivate(
        makeContext({
          user: { userId: 'not-an-id', actorId: ACTOR_ID, accountType: 'business' },
          deviceId: 'device-a',
        }),
      ),
    ).resolves.toBe(true);
    expect(sessionModel.findOne).not.toHaveBeenCalled();
  });
});
