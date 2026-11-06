/**
 * Unit tests for BusinessSessionsService (business-members-system task 8.10).
 *
 * The contract under test is the device limit: one active device per
 * (business, member). A login from a second device must evict the first and
 * report that it did, so the caller can notify the evicted device.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { BusinessSessionsService } from './business-sessions.service';
import { BusinessSession } from './schemas/business-session.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/user.schema';

const BUSINESS = new Types.ObjectId().toHexString();
const MEMBER = new Types.ObjectId().toHexString();
const OTHER_MEMBER = new Types.ObjectId().toHexString();
const SESSION = new Types.ObjectId().toHexString();

const sessionModel = {
  findOne: jest.fn(),
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  deleteOne: jest.fn(),
  deleteMany: jest.fn(),
};

const userModel = { findById: jest.fn() };
const notifications = { sendForcedLogoutPush: jest.fn() };

describe('BusinessSessionsService', () => {
  let service: BusinessSessionsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessSessionsService,
        {
          provide: getModelToken(BusinessSession.name),
          useValue: sessionModel,
        },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = module.get(BusinessSessionsService);
    sessionModel.findOneAndUpdate.mockResolvedValue({});
    sessionModel.deleteOne.mockResolvedValue({ deletedCount: 1 });
    notifications.sendForcedLogoutPush.mockResolvedValue(undefined);
    userModel.findById.mockReturnValue({
      select: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue({ displayName: 'Shop ABC' }),
      })),
    });
  });

  // ─── Device limit (tasks 8.2, 8.3) ────────────────────────────────────────

  describe('createOrReplaceSession', () => {
    it('creates the first session without forcing a logout', async () => {
      sessionModel.findOne.mockResolvedValue(null);

      const result = await service.createOrReplaceSession(
        BUSINESS,
        MEMBER,
        'device-a',
      );

      expect(result).toEqual({ forcedLogout: false, oldDeviceId: undefined });
      expect(sessionModel.deleteOne).not.toHaveBeenCalled();
      expect(notifications.sendForcedLogoutPush).not.toHaveBeenCalled();
      expect(sessionModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ deviceId: 'device-a' }),
        { upsert: true },
      );
    });

    it('evicts the previous device and names it when a new device logs in', async () => {
      sessionModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
        deviceId: 'device-a',
      });

      const result = await service.createOrReplaceSession(
        BUSINESS,
        MEMBER,
        'device-b',
      );

      expect(result.forcedLogout).toBe(true);
      expect(result.oldDeviceId).toBe('device-a');
      expect(sessionModel.deleteOne).toHaveBeenCalledTimes(1);
      // Task 8.5: the evicted device is told why it lost the session.
      expect(notifications.sendForcedLogoutPush).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: MEMBER,
          businessId: BUSINESS,
          businessName: 'Shop ABC',
          evictedDeviceId: 'device-a',
        }),
      );
    });

    it('still completes the switch when the eviction push fails', async () => {
      sessionModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
        deviceId: 'device-a',
      });
      notifications.sendForcedLogoutPush.mockRejectedValue(new Error('fcm down'));

      const result = await service.createOrReplaceSession(
        BUSINESS,
        MEMBER,
        'device-b',
      );

      expect(result.forcedLogout).toBe(true);
      expect(sessionModel.findOneAndUpdate).toHaveBeenCalled();
    });

    it('treats a re-login from the SAME device as a refresh, not an eviction', async () => {
      sessionModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
        deviceId: 'device-a',
      });

      const result = await service.createOrReplaceSession(
        BUSINESS,
        MEMBER,
        'device-a',
      );

      expect(result.forcedLogout).toBe(false);
      expect(sessionModel.deleteOne).not.toHaveBeenCalled();
    });

    it('persists the device metadata shown in the active-sessions list', async () => {
      sessionModel.findOne.mockResolvedValue(null);

      await service.createOrReplaceSession(BUSINESS, MEMBER, 'device-a', {
        deviceModel: 'Xiaomi 15 Pro',
        osVersion: 'Android 15',
        appVersion: '1.2.3',
      });

      expect(sessionModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          deviceModel: 'Xiaomi 15 Pro',
          osVersion: 'Android 15',
          appVersion: '1.2.3',
          lastActiveAt: expect.any(Date),
        }),
        { upsert: true },
      );
    });
  });

  // ─── Admin force logout (task 8.7) ────────────────────────────────────────

  describe('forceLogout', () => {
    it('deletes another member’s session', async () => {
      sessionModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(SESSION),
        userId: new Types.ObjectId(OTHER_MEMBER),
      });

      await service.forceLogout(SESSION, BUSINESS, MEMBER);

      expect(sessionModel.deleteOne).toHaveBeenCalledTimes(1);
    });

    it('refuses to log the caller out of their own session', async () => {
      sessionModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(SESSION),
        userId: new Types.ObjectId(MEMBER),
      });

      await expect(
        service.forceLogout(SESSION, BUSINESS, MEMBER),
      ).rejects.toThrow(BadRequestException);
      expect(sessionModel.deleteOne).not.toHaveBeenCalled();
    });

    it('404s for a session that is gone, rather than reporting success', async () => {
      sessionModel.findOne.mockResolvedValue(null);

      await expect(
        service.forceLogout(SESSION, BUSINESS, MEMBER),
      ).rejects.toThrow(NotFoundException);
    });

    it('404s on a malformed session id instead of throwing a cast error', async () => {
      await expect(
        service.forceLogout('not-an-id', BUSINESS, MEMBER),
      ).rejects.toThrow(NotFoundException);
      expect(sessionModel.findOne).not.toHaveBeenCalled();
    });
  });

  // ─── Activity + teardown (tasks 8.8, 8.9, 5.5) ────────────────────────────

  describe('activity and teardown', () => {
    it('touches lastActiveAt for the (business, member) pair', async () => {
      await service.updateActivity(BUSINESS, MEMBER);

      expect(sessionModel.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId: expect.anything(),
          userId: expect.anything(),
        }),
        { lastActiveAt: expect.any(Date) },
      );
    });

    it('deletes the session on explicit logout', async () => {
      await service.deleteSession(BUSINESS, MEMBER);

      expect(sessionModel.deleteOne).toHaveBeenCalled();
    });

    it('deletes every session of a removed member', async () => {
      sessionModel.deleteMany.mockResolvedValue({ deletedCount: 2 });

      await service.deleteUserSessions(BUSINESS, MEMBER);

      expect(sessionModel.deleteMany).toHaveBeenCalled();
    });
  });
});
